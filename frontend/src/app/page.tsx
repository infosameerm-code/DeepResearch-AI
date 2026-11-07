"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://127.0.0.1:8000";

type Tab = "dashboard" | "history" | "saved" | "settings";
type Source = { id: string; title: string; url: string; subtopic?: string };
type ResearchResult = {
  id?: number; status: string; topic?: string; message?: string;
  research_plan?: string[]; sources_collected?: number; sources?: Source[]; report?: string;
};
type HistoryItem = {
  id: number; query: string; status: string; report?: string; created_at?: string;
};
type UploadedFile = { filename: string; extracted_text: string };
type User = { id?: number; name?: string; email?: string };

const navItems: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "history", label: "Research History", icon: "◷" },
  { id: "saved", label: "Saved Reports", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [query, setQuery] = useState("");
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [showFileText, setShowFileText] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadHistory() {
    try {
      const response = await fetch(`${API_URL}/research`);
      if (!response.ok) throw new Error("Could not load research history");
      const data = await response.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("History error:", error);
      setMessage("Could not load research history. Check that the backend is running.");
    }
  }

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) setUser(JSON.parse(savedUser));
      setDarkMode(localStorage.getItem("deepresearch-dark") === "true");
      setCompactMode(localStorage.getItem("deepresearch-compact") === "true");
    } catch { /* Ignore invalid local preferences. */ }

    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) throw new Error("Backend error");
        const data = await response.json();
        setBackendStatus(data.status === "healthy" ? "Connected" : "Error");
        await loadHistory();
      } catch {
        setBackendStatus("Disconnected");
      }
    }
    checkBackend();
  }, []);

  function selectTab(next: Tab) {
    setTab(next);
    setProfileOpen(false);
    if (next === "history" || next === "saved") loadHistory();
  }

  function newResearch() {
    setTab("dashboard");
    setQuery("");
    setResult(null);
    setMessage("");
    setUploadedFile(null);
    setShowFileText(false);
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    router.push("/login");
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx", ".txt"].includes(extension)) {
      setMessage("Please upload only PDF, DOCX or TXT files.");
      event.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("File size must not exceed 10 MB.");
      event.target.value = "";
      return;
    }
    setUploading(true);
    setMessage("Uploading and extracting document text...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_URL}/files/upload`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "File upload failed.");
      setUploadedFile({ filename: data.filename, extracted_text: data.extracted_text || "" });
      setMessage(`Successfully extracted text from ${data.filename}. The text will be included in your research request.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload file.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function startResearch() {
    if (!query.trim() && !uploadedFile) {
      setMessage("Enter a research topic or attach a document first.");
      return;
    }
    if (loading) return;
    const documentContext = uploadedFile?.extracted_text
      ? `\n\nDOCUMENT TO ANALYSE (${uploadedFile.filename}):\n${uploadedFile.extracted_text.slice(0, 12000)}\n\nUse the document content as primary context and research the topic above.`
      : "";
    const finalQuery = `${query.trim() || "Analyse the attached document"}${documentContext}`;
    setLoading(true);
    setMessage("Your AI research is starting...");
    setResult(null);
    try {
      const response = await fetch(
        `${API_URL}/research/autonomous?query=${encodeURIComponent(finalQuery)}`,
        { method: "POST", headers: { Accept: "application/json" } }
      );
      const data: ResearchResult = await response.json();
      if (!response.ok || data.status !== "completed") {
        throw new Error(data.message || "Research could not be completed. Check Ollama and Tavily configuration.");
      }
      setResult(data);
      setMessage("Research completed successfully!");
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function openPreviousReport(item: HistoryItem) {
    try {
      const response = await fetch(`${API_URL}/research/${item.id}`);
      if (!response.ok) throw new Error("Could not open this report.");
      const data = await response.json();
      setQuery(data.query || "");
      setResult({
        id: data.id, status: data.status, topic: data.query,
        report: data.report || "No report available.",
      });
      setTab("dashboard");
      setMessage("Previous research report loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open report.");
    }
  }

  async function deleteReport(id: number) {
    if (!window.confirm("Are you sure you want to permanently delete this report?")) return;
    setDeletingId(id);
    try {
      const response = await fetch(`${API_URL}/research/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not delete report.");
      setHistory(previous => previous.filter(item => item.id !== id));
      if (result?.id === id) setResult(null);
      setMessage("Research report deleted successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function downloadReport(format: "pdf" | "docx") {
    if (!result?.id) {
      setMessage("Research ID is not available. Open a saved report first.");
      return;
    }
    setDownloadingFormat(format);
    try {
      const response = await fetch(`${API_URL}/research/${result.id}/export/${format}`);
      if (!response.ok) {
        let detail = "Report download failed.";
        try { const data = await response.json(); detail = data.detail || detail; } catch { /* ignore */ }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `research_${result.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setMessage(`${format.toUpperCase()} report downloaded successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to download report.");
    } finally {
      setDownloadingFormat(null);
    }
  }

  const visibleHistory = tab === "saved"
    ? history.filter(item => item.status === "completed" && Boolean(item.report))
    : history;
  const pageTitle = tab === "dashboard" ? "Dashboard" : navItems.find(item => item.id === tab)?.label;

  return (
    <div className={`min-h-screen flex ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      <aside className={`hidden md:flex w-64 shrink-0 flex-col border-r p-5 ${darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <button onClick={newResearch} className="mb-9 text-left text-2xl font-extrabold tracking-tight text-purple-700">
          DeepResearch AI
        </button>
        <button onClick={newResearch} className="mb-6 flex items-center gap-3 rounded-xl bg-purple-100 px-4 py-3 text-left font-semibold text-purple-700 hover:bg-purple-200">
          <span className="text-xl">＋</span> New Research
        </button>
        <nav className="flex-1 space-y-2" aria-label="Main navigation">
          {navItems.map(item => (
            <button key={item.id} onClick={() => selectTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${tab === item.id ? "bg-purple-100 font-semibold text-purple-700" : darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"}`}>
              <span className="w-6 text-center text-xl" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className={`rounded-xl p-4 ${darkMode ? "bg-slate-800" : "bg-purple-50"}`}>
          <p className="font-semibold text-purple-700">Deep Research</p>
          <p className={`mt-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-500"}`}>AI-powered multi-source research workspace.</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Research Workspace</p>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-2 text-xs font-semibold ${backendStatus === "Connected" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>Backend: {backendStatus}</span>
            <div className="relative">
              <button onClick={() => setProfileOpen(value => !value)} aria-label="Open profile menu" aria-expanded={profileOpen}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-700 hover:bg-purple-200">
                {(user?.name || "U").charAt(0).toUpperCase()}
              </button>
              {profileOpen && (
                <div className={`absolute right-0 z-20 mt-2 w-60 rounded-xl border p-3 shadow-xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
                  <p className="font-semibold">{user?.name || "User"}</p>
                  <p className="mb-3 break-all text-xs text-slate-500">{user?.email || "No account details found"}</p>
                  <button onClick={() => selectTab("settings")} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-purple-50">⚙ Settings</button>
                  <button onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">↪ Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {navItems.map(item => (
            <button key={item.id} onClick={() => selectTab(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab === item.id ? "bg-purple-600 text-white" : "bg-white text-slate-700"}`}>{item.icon} {item.label}</button>
          ))}
        </div>

        {tab === "settings" ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-slate-900">Workspace Settings</h2>
            <p className="mb-6 text-sm text-slate-500">Change how the research workspace looks on this browser.</p>
            <label className="flex cursor-pointer items-center justify-between border-b border-slate-100 py-5 text-slate-800">
              <span><strong className="block">Dark mode</strong><small className="text-slate-500">Use a dark workspace theme.</small></span>
              <input type="checkbox" checked={darkMode} onChange={e => { setDarkMode(e.target.checked); localStorage.setItem("deepresearch-dark", String(e.target.checked)); }} className="h-5 w-5 accent-purple-600" />
            </label>
            <label className="flex cursor-pointer items-center justify-between py-5 text-slate-800">
              <span><strong className="block">Compact layout</strong><small className="text-slate-500">Reduce spacing in report lists.</small></span>
              <input type="checkbox" checked={compactMode} onChange={e => { setCompactMode(e.target.checked); localStorage.setItem("deepresearch-compact", String(e.target.checked)); }} className="h-5 w-5 accent-purple-600" />
            </label>
            <div className="mt-5 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">
              Signed in as {user?.email || "a local workspace user"}. Research data is currently stored by the local backend.
            </div>
            <button onClick={logout} className="mt-6 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600 hover:bg-red-100">Sign out</button>
          </section>
        ) : tab === "dashboard" ? (
          <section className="mx-auto max-w-5xl">
            <p className="mb-3 font-semibold text-purple-600">AI POWERED AUTONOMOUS RESEARCH</p>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">What do you want to research?</h2>
            <p className="mb-8 text-slate-500">Turn complex questions into detailed research reports using AI and internet sources.</p>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter your research topic or question..." disabled={loading}
                className="h-36 w-full resize-none bg-transparent text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFileUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    {uploading ? "Uploading..." : "📎 Attach File"}
                  </button>
                  <span className="text-xs text-slate-400">PDF, DOCX, TXT · Maximum 10 MB</span>
                </div>
                <button onClick={startResearch} disabled={loading || uploading || backendStatus !== "Connected"}
                  className="rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                  {loading ? "Researching..." : "Start Research →"}
                </button>
              </div>
              {uploadedFile && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold">📄 {uploadedFile.filename}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setShowFileText(value => !value)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-green-700">{showFileText ? "Hide text" : "Preview text"}</button>
                      <button onClick={() => { setUploadedFile(null); setShowFileText(false); }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-600">Remove</button>
                    </div>
                  </div>
                  {showFileText && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5">{uploadedFile.extracted_text}</pre>}
                </div>
              )}
              <p className="mt-3 text-xs text-slate-400">Powered by Ollama and Tavily</p>
            </div>

            {message && <div className="mt-5 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">{message}</div>}
            {loading && <div className="mt-5 rounded-xl border border-purple-100 bg-purple-50 p-5 text-purple-800"><span className="mr-2 inline-block animate-spin">◌</span> AI is preparing your research. This may take several minutes.</div>}

            {result?.status === "completed" && (
              <div className="mt-8 space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">Research Results</h3><span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">Completed</span></div>
                  <h4 className="text-lg font-semibold">{result.topic}</h4>
                  <p className="mt-2 text-sm text-slate-500">Research ID: {result.id ?? "N/A"} · Sources: {result.sources_collected ?? result.sources?.length ?? "N/A"}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button onClick={() => downloadReport("pdf")} disabled={!result.id || !!downloadingFormat} className="rounded-lg bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{downloadingFormat === "pdf" ? "Preparing..." : "↓ Download PDF"}</button>
                    <button onClick={() => downloadReport("docx")} disabled={!result.id || !!downloadingFormat} className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{downloadingFormat === "docx" ? "Preparing..." : "↓ Download DOCX"}</button>
                  </div>
                </section>
                {result.research_plan?.length ? <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800"><h3 className="mb-3 text-xl font-bold">Research Plan</h3><ol className="list-decimal space-y-2 pl-6">{result.research_plan.map((item, index) => <li key={index}>{item}</li>)}</ol></section> : null}
                <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800"><h3 className="mb-4 text-xl font-bold">AI Research Report</h3><div className="whitespace-pre-wrap break-words text-sm leading-7">{result.report || "No report available."}</div></section>
                {result.sources?.length ? <section className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800"><h3 className="mb-4 text-xl font-bold">Research Sources</h3><div className="space-y-4">{result.sources.map(source => <div key={source.id} className="border-b border-slate-100 pb-3 last:border-0"><p className="text-xs font-bold text-purple-600">{source.id}</p><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-purple-700">{source.title}</a>{source.subtopic && <p className="mt-1 text-xs text-slate-500">{source.subtopic}</p>}</div>)}</div></section> : null}
              </div>
            )}
          </section>
        ) : (
          <section className="mx-auto max-w-5xl">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-bold">{tab === "saved" ? "Saved Reports" : "Research History"}</h2><p className="mt-1 text-sm text-slate-500">{tab === "saved" ? "Completed reports with saved content." : "All research requests stored by your backend."}</p></div>
              <button onClick={loadHistory} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50">↻ Refresh</button>
            </div>
            {message && <div className="mb-4 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">{message}</div>}
            {visibleHistory.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><div className="mb-3 text-4xl">▤</div><h3 className="font-semibold text-slate-800">No reports yet</h3><p className="mt-1 text-sm text-slate-500">Start a research task and your reports will appear here.</p><button onClick={newResearch} className="mt-5 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700">＋ New Research</button></div>
            ) : (
              <div className="space-y-3">{visibleHistory.map(item => (
                <article key={item.id} className={`rounded-xl border border-slate-200 bg-white ${compactMode ? "p-3" : "p-5"}`}>
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1"><h3 className="break-words font-semibold text-slate-800">{item.query}</h3><p className="mt-2 text-xs text-slate-400">Report #{item.id}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}</p><span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">{item.status}</span></div>
                    <div className="flex flex-wrap gap-2"><button onClick={() => openPreviousReport(item)} className="rounded-lg bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-200">Open Report</button><button onClick={() => deleteReport(item.id)} disabled={deletingId === item.id} className="rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">{deletingId === item.id ? "Deleting..." : "Delete"}</button></div>
                  </div>
                </article>
              ))}</div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
