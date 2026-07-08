import { useState, useEffect } from 'react';
import { Calendar, Mail, Save, Play, Trash2, Clock, CheckCircle } from 'lucide-react';
import { Procedure } from '../types';

interface Props {
  procedures: Procedure[];
  dbConfig: any;
}

export default function ScheduleTab({ procedures, dbConfig }: Props) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  // Schedule state
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [commit, setCommit] = useState(false);
  const [selectedProcs, setSelectedProcs] = useState<string[]>([]);
  const [procParams, setProcParams] = useState<Record<string, Record<string, string>>>({});
  const [procDetails, setProcDetails] = useState<Record<string, any[]>>({});

  // SMTP state
  const [smtpServer, setSmtpServer] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEnc, setSmtpEnc] = useState('TLS');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  
  // Email state
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [emailSubject, setEmailSubject] = useState('Monthly SP Report — {date} — {database}');
  const [emailBody, setEmailBody] = useState('Hi,\\n\\nPlease find attached the monthly stored procedure reports for {database} generated on {date}.\\n\\nProcedures executed:\\n{procedures}\\n\\nRegards,\\nAutomated Report System');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      if (data) {
        setConfig(data);
        if (data.schedule) {
          setDayOfMonth(data.schedule.day_of_month || 1);
          setHour(data.schedule.hour || 9);
          setMinute(data.schedule.minute || 0);
          setCommit(data.schedule.commit || false);
          
          const pNames = data.schedule.procedures.map((p: any) => p.name);
          setSelectedProcs(pNames);
          
          const paramsMap: any = {};
          data.schedule.procedures.forEach((p: any) => {
            paramsMap[p.name] = p.params || {};
            // trigger param fetch
            const proc = procedures.find(pr => `[\${pr.SchemaName}].[\${pr.ProcedureName}]` === p.name || `\${pr.SchemaName}.\${pr.ProcedureName}` === p.name);
            if (proc) fetchParamsForProc(proc, p.name);
          });
          setProcParams(paramsMap);
        }
        if (data.smtp) {
          setSmtpServer(data.smtp.server || 'smtp.gmail.com');
          setSmtpPort(data.smtp.port || 587);
          setSmtpEnc(data.smtp.encryption || 'TLS');
          setSmtpUser(data.smtp.username || '');
          setSmtpPass(data.smtp.password || '');
        }
        if (data.email) {
          setEmailFrom(data.email.from || '');
          setEmailTo(data.email.to || '');
          setEmailCc(data.email.cc || '');
          setEmailBcc(data.email.bcc || '');
          setEmailSubject(data.email.subject || 'Monthly SP Report — {date} — {database}');
          setEmailBody(data.email.body || '');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchParamsForProc = async (proc: Procedure, fullName: string) => {
    try {
      const res = await fetch('/api/procedures/parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConfig, objectId: proc.ObjectId })
      });
      const data = await res.json();
      setProcDetails(prev => ({ ...prev, [fullName]: data.parameters }));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleProcSelection = (proc: Procedure) => {
    const fullName = `[\${proc.SchemaName}].[\${proc.ProcedureName}]`;
    let newProcs = [...selectedProcs];
    if (newProcs.includes(fullName)) {
      newProcs = newProcs.filter(p => p !== fullName);
    } else {
      newProcs.push(fullName);
      if (!procDetails[fullName]) {
        fetchParamsForProc(proc, fullName);
      }
    }
    setSelectedProcs(newProcs);
  };

  const handleParamChange = (procName: string, paramName: string, val: string) => {
    setProcParams(prev => ({
      ...prev,
      [procName]: {
        ...(prev[procName] || {}),
        [paramName]: val
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const newConfig = {
      schedule: {
        day_of_month: dayOfMonth,
        hour,
        minute,
        commit,
        procedures: selectedProcs.map(name => ({
          name,
          params: procParams[name] || {}
        }))
      },
      smtp: {
        server: smtpServer,
        port: smtpPort,
        encryption: smtpEnc,
        username: smtpUser,
        password: smtpPass
      },
      email: {
        from: emailFrom || smtpUser,
        to: emailTo,
        cc: emailCc,
        bcc: emailBcc,
        subject: emailSubject,
        body: emailBody
      },
      connection: dbConfig,
      last_run: config?.last_run,
      last_status: config?.last_status
    };

    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      setConfig(newConfig);
      alert('Schedule saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await fetch('/api/schedule', { method: 'DELETE' });
      setConfig(null);
      alert('Schedule deleted.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/schedule/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp: { server: smtpServer, port: smtpPort, encryption: smtpEnc, username: smtpUser, password: smtpPass },
          email: { to: emailTo }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('SMTP Connection successful!');
      } else {
        alert('SMTP Error: ' + data.message);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-8 font-mono text-sm text-slate-500 uppercase tracking-widest text-center">Loading configuration...</div>;

  return (
    <div className="h-full overflow-y-auto p-6 bg-transparent text-slate-200">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {config && (
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-900/20 border border-emerald-500/20 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                Schedule Active
              </h3>
              <p className="text-sm font-mono text-slate-400">Executes on day {config.schedule?.day_of_month} at {String(config.schedule?.hour).padStart(2, '0')}:{String(config.schedule?.minute).padStart(2, '0')} GMT</p>
            </div>
            <div className="text-right text-xs font-mono text-slate-500 uppercase">
              <p>Last Sync: <span className="text-slate-300">{config.last_run ? new Date(config.last_run).toLocaleString() : 'Never'}</span></p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Col - Schedule */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col space-y-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-4">
              <Clock className="w-4 h-4 text-sky-500" /> Temporal Controls
            </h3>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-mono text-slate-500 uppercase">Execution Day (1-28)</label>
                  <span className="text-sky-400 font-mono text-lg">{dayOfMonth}</span>
                </div>
                <input type="range" min="1" max="28" value={dayOfMonth} onChange={e => setDayOfMonth(parseInt(e.target.value))} className="w-full accent-sky-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-500 uppercase">Hour (0-23)</label>
                  <input type="number" min="0" max="23" value={hour} onChange={e => setHour(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-500 uppercase">Minute (0-59)</label>
                  <input type="number" min="0" max="59" value={minute} onChange={e => setMinute(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />
                </div>
              </div>

              <label className="flex items-center gap-3 text-xs font-mono text-slate-400 uppercase cursor-pointer p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                <input type="checkbox" checked={commit} onChange={e => setCommit(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500" />
                Commit changes on scheduled execution
              </label>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-800 flex-1">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Included Routines</h4>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col max-h-[400px]">
                <div className="overflow-y-auto p-3 space-y-2">
                  {procedures.map(p => {
                    const fullName = `[${p.SchemaName}].[${p.ProcedureName}]`;
                    const isSelected = selectedProcs.includes(fullName);
                    return (
                      <div key={fullName} className="rounded-xl overflow-hidden border border-transparent hover:border-slate-800/50 transition-colors">
                        <label className="flex items-center gap-3 p-3 bg-slate-900/30 cursor-pointer">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleProcSelection(p)} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500" />
                          <span className="text-[13px] font-mono text-slate-300 truncate">{p.SchemaName}.{p.ProcedureName}</span>
                        </label>
                        {isSelected && procDetails[fullName] && procDetails[fullName].length > 0 && (
                          <div className="p-4 bg-slate-900/10 border-t border-slate-800/50 space-y-4">
                            <h5 className="text-[10px] font-mono text-sky-500/80 uppercase">Static Parameters</h5>
                            <div className="grid grid-cols-1 gap-3">
                              {procDetails[fullName].filter((param: any) => !param.IsOutput).map((param: any) => (
                                <div key={param.ParameterName} className="space-y-1.5">
                                  <label className="text-[10px] font-mono text-slate-500 uppercase">{param.ParameterName} ({param.DataType})</label>
                                  <input 
                                    type={param.DataType.includes('date') ? 'date' : 'text'}
                                    value={procParams[fullName]?.[param.ParameterName] || ''}
                                    onChange={(e) => handleParamChange(fullName, param.ParameterName, e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Col - Email */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col space-y-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-4">
              <Mail className="w-4 h-4 text-purple-500" /> Dispatch Routing
            </h3>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-5">
              <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">SMTP Configuration</h4>
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase">Hostname</label>
                <input type="text" value={smtpServer} onChange={e => setSmtpServer(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Port</label>
                  <input type="number" value={smtpPort} onChange={e => setSmtpPort(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Security</label>
                  <select value={smtpEnc} onChange={e => setSmtpEnc(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500">
                    <option>TLS</option>
                    <option>SSL</option>
                    <option>None</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Identity</label>
                  <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">Token/Password</label>
                  <input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
              </div>
              
              <button onClick={handleTestEmail} disabled={testing} className="w-full py-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Verify Connection
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-5">
              <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Message Blueprint</h4>
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase">Sender Origin</label>
                <input type="text" value={emailFrom} onChange={e => setEmailFrom(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase">Destinations (CSV)</label>
                <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="team@domain.com" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">CC</label>
                  <input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400 uppercase">BCC</label>
                  <input type="text" value={emailBcc} onChange={e => setEmailBcc(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase">Header Template</label>
                <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase">Payload Template</label>
                <textarea rows={5} value={emailBody} onChange={e => setEmailBody(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none font-mono text-[11px]" />
                <p className="text-[10px] font-mono text-slate-500">Injectors: <span className="text-sky-400">{"{date}"}</span>, <span className="text-sky-400">{"{database}"}</span>, <span className="text-sky-400">{"{procedures}"}</span></p>
              </div>
            </div>

          </div>
        </div>

        {/* Actions */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex gap-4">
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="flex-1 bg-sky-500 hover:bg-sky-400 text-slate-900 py-4 rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-sky-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" /> Commit Schedule
          </button>
          {config && (
            <button 
              onClick={handleDelete}
              className="w-16 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 py-4 rounded-2xl transition-colors flex items-center justify-center"
              title="Purge Schedule"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
