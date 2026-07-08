/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Database, Search, Play, Calendar, Mail, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Procedure, Parameter } from './types';
import SandboxTab from './components/SandboxTab';
import ScheduleTab from './components/ScheduleTab';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dbConfig, setDbConfig] = useState({
    server: '.\\SQLEXPRESS',
    database: 'Liberty_shoes',
    auth_type: 'Windows Authentication',
    username: '',
    password: '',
  });

  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [activeTab, setActiveTab] = useState<'sandbox' | 'schedule'>('sandbox');

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig),
      });
      const data = await res.json();
      if (data.success) {
        setConnected(true);
        fetchProcedures();
      } else {
        setError(data.message || 'Connection failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProcedures = async () => {
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig),
      });
      const data = await res.json();
      if (data.success) {
        setProcedures(data.procedures);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-screen bg-[#0B0F1A] text-slate-200 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Database className="w-5 h-5 text-sky-500" />
            Connection
          </h2>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Server Instance</label>
            <input
              type="text"
              value={dbConfig.server}
              onChange={(e) => setDbConfig({ ...dbConfig, server: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Database Name</label>
            <input
              type="text"
              value={dbConfig.database}
              onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Authentication</label>
            <select
              value={dbConfig.auth_type}
              onChange={(e) => setDbConfig({ ...dbConfig, auth_type: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option>Windows Authentication</option>
              <option>SQL Server Authentication</option>
            </select>
          </div>

          {dbConfig.auth_type === 'SQL Server Authentication' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Username</label>
                <input
                  type="text"
                  value={dbConfig.username}
                  onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Password</label>
                <input
                  type="password"
                  value={dbConfig.password}
                  onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </>
          )}

          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full mt-4 bg-sky-500 hover:bg-sky-400 text-slate-900 font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-500/20 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Connect ⚡'}
          </button>
          
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {connected && !error && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Connected successfully!</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-8 py-6 border-b border-slate-800 shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            🗄️ SQL Server Stored Procedure Explorer
            <span className="text-sky-500 font-mono text-xs ml-3 px-2 py-1 bg-sky-500/10 rounded-md align-middle border border-sky-500/20">v2.4.0</span>
          </h1>
          <p className="text-slate-500 text-sm">Explore, inspect, execute, schedule, and email stored procedure reports.</p>
        </header>

        {!connected ? (
          <div className="flex-1 p-8 flex items-center justify-center overflow-y-auto">
            <div className="w-full max-w-4xl space-y-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 mb-4 shadow-lg shadow-sky-500/10">
                  <Database className="w-8 h-8 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">Connect to your Database</h3>
                <p className="text-slate-400 leading-relaxed max-w-lg mt-2">
                  Please enter your SQL Server connection details in the sidebar and click 'Connect' to begin exploring.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6 text-left">
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Features</h4>
                  <ul className="space-y-3 text-sm text-slate-500">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div> Live Connection via Windows Auth or Login</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div> Interactive Search & Source Definition</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Execution Sandbox</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Monthly Scheduler & Email Reports</li>
                  </ul>
                </div>
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Connection Reference</h4>
                  <ul className="space-y-3 text-sm text-slate-500">
                    <li className="flex flex-col">
                      <span className="text-[10px] font-mono text-slate-600 uppercase">Server</span>
                      <strong className="text-slate-300 font-mono text-xs">.\SQLEXPRESS or localhost</strong>
                    </li>
                    <li className="flex flex-col">
                      <span className="text-[10px] font-mono text-slate-600 uppercase">Authentication</span>
                      <strong className="text-slate-300 font-mono text-xs">Windows Authentication</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-6 p-6 shrink-0">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Total Procedures</span>
                <span className="text-3xl font-bold text-sky-400">{procedures.length}</span>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Target Server</span>
                <span className="text-xl font-bold text-white truncate max-w-full">{dbConfig.server}</span>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Database</span>
                <span className="text-xl font-bold text-white truncate max-w-full">{dbConfig.database}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 flex gap-2 border-b border-slate-800 shrink-0">
              <button
                onClick={() => setActiveTab('sandbox')}
                className={cn(
                  "px-6 py-3 text-sm font-medium rounded-t-xl transition-colors flex items-center gap-2",
                  activeTab === 'sandbox' 
                    ? "bg-slate-900/50 text-white border-b-2 border-sky-500" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                )}
              >
                <Play className="w-4 h-4" />
                Execution Sandbox
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={cn(
                  "px-6 py-3 text-sm font-medium rounded-t-xl transition-colors flex items-center gap-2",
                  activeTab === 'schedule' 
                    ? "bg-slate-900/50 text-white border-b-2 border-sky-500" 
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                )}
              >
                <Calendar className="w-4 h-4" />
                Scheduler & Email
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'sandbox' ? (
                <SandboxTab procedures={procedures} dbConfig={dbConfig} />
              ) : (
                <ScheduleTab procedures={procedures} dbConfig={dbConfig} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
