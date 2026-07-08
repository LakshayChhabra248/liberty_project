import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import sql from "mssql";
import schedule from "node-schedule";
import nodemailer from "nodemailer";
import * as xlsx from "xlsx";
import fs from "fs";

const CONFIG_FILE = path.join(process.cwd(), "scheduler_config.json");

let currentSchedulerConfig: any = null;

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      currentSchedulerConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e) {
      console.error("Failed to load config", e);
    }
  }
}

function saveConfig(config: any) {
  currentSchedulerConfig = config;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

loadConfig();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Helper to connect to SQL Server
  async function connectDb(config: any) {
    const authType = config.auth_type;
    const dbConfig: sql.config = {
      server: config.server,
      database: config.database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    if (authType === "SQL Server Authentication") {
      dbConfig.user = config.username;
      dbConfig.password = config.password;
    } else {
      // For Windows Authentication in tedious, we usually need the node-sspi or similar,
      // but mssql with tedious doesn't natively support Windows Auth smoothly on all platforms.
      // Usually, domain, username, password are required for NTLM.
      // We will assume NTLM or just use the current user if possible, but tedious requires credentials.
      // If the original python app used pyodbc with `Trusted_Connection=yes`, we might have limitations
      // in Node.js. For NTLM:
      if (config.username && config.password) {
        dbConfig.authentication = {
          type: 'ntlm',
          options: {
            domain: config.domain || '',
            userName: config.username,
            password: config.password,
          },
        };
      }
    }

    const pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    return pool;
  }

  app.post("/api/connect", async (req, res) => {
    try {
      const pool = await connectDb(req.body);
      await pool.close();
      res.json({ success: true, message: "Connected successfully!" });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/procedures", async (req, res) => {
    let pool;
    try {
      pool = await connectDb(req.body);
      const result = await pool.request().query(`
        SELECT 
            SCHEMA_NAME(schema_id) AS SchemaName,
            name AS ProcedureName,
            create_date AS CreatedDate,
            modify_date AS ModifyDate,
            object_id AS ObjectId
        FROM 
            sys.procedures
        ORDER BY 
            SCHEMA_NAME(schema_id), name;
      `);
      res.json({ success: true, procedures: result.recordset });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    } finally {
      if (pool) await pool.close();
    }
  });

  app.post("/api/procedures/definition", async (req, res) => {
    let pool;
    try {
      pool = await connectDb(req.body.connection);
      const result = await pool.request()
        .input("objectId", sql.Int, req.body.objectId)
        .query(`SELECT definition FROM sys.sql_modules WHERE object_id = @objectId;`);
      
      const definition = result.recordset[0]?.definition || "-- Definition could not be retrieved.";
      res.json({ success: true, definition });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    } finally {
      if (pool) await pool.close();
    }
  });

  app.post("/api/procedures/parameters", async (req, res) => {
    let pool;
    try {
      pool = await connectDb(req.body.connection);
      const result = await pool.request()
        .input("objectId", sql.Int, req.body.objectId)
        .query(`
        SELECT 
            p.name AS ParameterName,
            t.name AS DataType,
            p.max_length AS MaxLength,
            p.precision AS Precision,
            p.scale AS Scale,
            p.is_output AS IsOutput
        FROM 
            sys.parameters p
        INNER JOIN 
            sys.types t ON p.user_type_id = t.user_type_id
        WHERE 
            p.object_id = @objectId
        ORDER BY 
            p.parameter_id;
        `);
      res.json({ success: true, parameters: result.recordset });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    } finally {
      if (pool) await pool.close();
    }
  });

  app.post("/api/execute", async (req, res) => {
    let pool;
    try {
      const { connection, procedureName, params, commit } = req.body;
      pool = await connectDb(connection);
      
      // We will construct the SQL command and execute it
      let query = `SET NOCOUNT ON; EXEC \${procedureName}`;
      const request = pool.request();
      
      const paramFragments: string[] = [];
      
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          const paramName = key.startsWith('@') ? key.substring(1) : key;
          
          if (value === "" || value === null || value === undefined) {
             paramFragments.push(`@\${paramName} = NULL`);
          } else {
             const safeName = paramName.replace(/[^a-zA-Z0-9_]/g, '');
             request.input(safeName, value as any);
             paramFragments.push(`@\${paramName} = @\${safeName}`);
          }
        }
      }
      
      if (paramFragments.length > 0) {
        query += " " + paramFragments.join(", ");
      }
      
      // Note: we can't easily capture multiple recordsets using request.query, but tedious driver does it partially.
      // For mssql, request.query() returns recordsets as an array.
      const result = await request.query(query);
      
      if (!commit) {
         // This is a sandbox execute, we probably don't have transaction support this way,
         // but since it's an EXEC, rolling it back safely requires wrapping it in a BEGIN TRAN ... ROLLBACK
         // We will wrap the execution query.
         query = `BEGIN TRAN; \${query}; ROLLBACK;`;
      }
      
      // Let's actually execute it the right way
      const execRequest = pool.request();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          const safeName = (key.startsWith('@') ? key.substring(1) : key).replace(/[^a-zA-Z0-9_]/g, '');
          if (value !== "" && value !== null && value !== undefined) {
             execRequest.input(safeName, value as any);
          }
        }
      }
      
      const finalResult = await execRequest.query(query);

      res.json({ 
        success: true, 
        resultSets: finalResult.recordsets || [],
        rowsAffected: finalResult.rowsAffected || []
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    } finally {
      if (pool) await pool.close();
    }
  });

  // Scheduling endpoints
  app.get("/api/schedule", (req, res) => {
    res.json(currentSchedulerConfig);
  });

  app.post("/api/schedule", (req, res) => {
    saveConfig(req.body);
    setupCronJob();
    res.json({ success: true });
  });

  app.delete("/api/schedule", (req, res) => {
    currentSchedulerConfig = null;
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    setupCronJob();
    res.json({ success: true });
  });

  async function sendEmailWithAttachments(smtp: any, email: any, attachments: any[]) {
    let transporter;
    if (smtp.encryption === "SSL") {
      transporter = nodemailer.createTransport({
        host: smtp.server,
        port: smtp.port,
        secure: true,
        auth: {
          user: smtp.username,
          pass: smtp.password,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: smtp.server,
        port: smtp.port,
        secure: false, // TLS
        auth: {
          user: smtp.username,
          pass: smtp.password,
        },
      });
    }

    const mailOptions = {
      from: email.from || smtp.username,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      text: email.body,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.data
      })),
    };

    return await transporter.sendMail(mailOptions);
  }

  app.post("/api/schedule/test", async (req, res) => {
    try {
      const { smtp, email } = req.body;
      const transporter = nodemailer.createTransport({
        host: smtp.server,
        port: smtp.port,
        secure: smtp.encryption === "SSL",
        auth: {
          user: smtp.username,
          pass: smtp.password,
        },
      });
      await transporter.verify();
      res.json({ success: true, message: "SMTP connection successful!" });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Background Job function
  let currentJob: schedule.Job | null = null;

  function setupCronJob() {
    if (currentJob) {
      currentJob.cancel();
      currentJob = null;
    }
    if (currentSchedulerConfig && currentSchedulerConfig.schedule) {
      const s = currentSchedulerConfig.schedule;
      // Convert day_of_month, hour, minute to cron expression
      const cronExpr = `\${s.minute} \${s.hour} \${s.day_of_month} * *`;
      currentJob = schedule.scheduleJob(cronExpr, async () => {
         console.log("Running scheduled job!");
         try {
           const conf = currentSchedulerConfig;
           const pool = await connectDb(conf.connection);
           const attachments: any[] = [];
           const resultsLog: string[] = [];
           
           for (const proc of conf.schedule.procedures) {
             try {
               let query = `SET NOCOUNT ON; EXEC \${proc.name}`;
               const request = pool.request();
               const paramFragments: string[] = [];
               
               if (proc.params) {
                 for (const [key, value] of Object.entries(proc.params)) {
                   const paramName = key.startsWith('@') ? key.substring(1) : key;
                   if (value === "" || value === null || value === undefined) {
                     paramFragments.push(`@\${paramName} = NULL`);
                   } else {
                     const safeName = paramName.replace(/[^a-zA-Z0-9_]/g, '');
                     request.input(safeName, value as any);
                     paramFragments.push(`@\${paramName} = @\${safeName}`);
                   }
                 }
               }
               if (paramFragments.length > 0) {
                 query += " " + paramFragments.join(", ");
               }
               
               if (!conf.schedule.commit) {
                 query = `BEGIN TRAN; \${query}; ROLLBACK;`;
               }
               
               const finalResult = await request.query(query);
               resultsLog.push(`✅ \${proc.name}: Executed successfully (\${finalResult.rowsAffected?.[0] || 0} rows affected)`);
               
               if (finalResult.recordsets) {
                 finalResult.recordsets.forEach((rs: any, idx: number) => {
                   if (rs.length > 0) {
                     const ws = xlsx.utils.json_to_sheet(rs);
                     const wb = xlsx.utils.book_new();
                     xlsx.utils.book_append_sheet(wb, ws, "Results");
                     const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
                     const safeName = proc.name.replace(/[^a-zA-Z0-9_]/g, '_');
                     attachments.push({
                       filename: `\${safeName}_result_\${idx + 1}.xlsx`,
                       data: excelBuffer
                     });
                   }
                 });
               }
             } catch (err: any) {
               resultsLog.push(`❌ \${proc.name}: Execution failed — \${err.message}`);
             }
           }
           
           await pool.close();
           
           // Send Email
           const nowStr = new Date().toLocaleString();
           const dbName = conf.connection.database;
           const procList = conf.schedule.procedures.map((p: any) => `  • \${p.name}`).join('\\n');
           
           const subject = (conf.email.subject || '').replace('{date}', nowStr).replace('{database}', dbName).replace('{procedures}', procList);
           const body = (conf.email.body || '').replace('{date}', nowStr).replace('{database}', dbName).replace('{procedures}', procList);
           
           const emailToSend = { ...conf.email, subject, body };
           
           if (conf.smtp && conf.smtp.server) {
             try {
               await sendEmailWithAttachments(conf.smtp, emailToSend, attachments);
               resultsLog.push('📧 Email sent successfully!');
             } catch (err: any) {
               resultsLog.push(`📧 Email failed: \${err.message}`);
             }
           } else {
             resultsLog.push('📧 No SMTP configured — email skipped.');
           }
           
           conf.last_run = new Date().toISOString();
           conf.last_status = resultsLog.join(' | ');
           saveConfig(conf);
           
         } catch (e: any) {
           console.error("Scheduled job failed", e);
           const conf = currentSchedulerConfig;
           conf.last_run = new Date().toISOString();
           conf.last_status = "FAILED: " + e.message;
           saveConfig(conf);
         }
      });
    }
  }

  setupCronJob();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:\${PORT}`);
  });
}

startServer();
