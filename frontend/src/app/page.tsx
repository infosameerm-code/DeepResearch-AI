
"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

type Source = {
  id: string;
  title: string;
  url: string;
  subtopic?: string;
};

type ResearchResult = {
  id?: number;
  status: string;
  topic?: string;
  message?: string;
  research_plan?: string[];
  sources_collected?: number;
  sources?: Source[];
  report?: string;
};

type HistoryItem = {
  id: number;
  query: string;
  status: string;
  report?: string;
  created_at?: string;
};

type UploadedFile = {
  filename: string;
  extracted_text: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  // FILE UPLOAD STATES
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [showFileText, setShowFileText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadHistory() {
    try {
      const response = await fetch(`${API_URL}/research`);

      if (!response.ok) {
        throw new Error("Could not load research history");
      }

      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error("History error:", error);
    }
  }

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) throw new Error("Backend error");

        const data = await response.json();

        setBackendStatus(
          data.status === "healthy" ? "Connected" : "Error"
        );

        await loadHistory();
      } catch {
        setBackendStatus("Disconnected");
      }
    }

    checkBackend();
  }, []);

  // FILE UPLOAD FUNCTION
  async function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedExtensions = [".pdf", ".docx", ".txt"];
    const extension = file.name.substring(
      file.name.lastIndexOf(".")
    ).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
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
    setMessage("Uploading and processing your document...");
    setUploadedFile(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/files/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "File upload failed."
        );
      }

      setUploadedFile({
        filename: data.filename,
        extracted_text: data.extracted_text,
      });

      setMessage(
        `Successfully uploaded ${data.filename}. Document text extracted.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload file."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function removeUploadedFile() {
    setUploadedFile(null);
    setShowFileText(false);
    setMessage("Uploaded document removed.");
  }

  async function startResearch() {
    if (!query.trim()) {
      setMessage("Please enter a research topic first.");
      return;
    }

    if (loading) return;

    setLoading(true);
    setMessage("Your AI research is starting...");
    setResult(null);

    try {
      const response = await fetch(
        `${API_URL}/research/autonomous?query=${encodeURIComponent(query.trim())}`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        }
      );

      const data: ResearchResult = await response.json();

      if (!response.ok || data.status !== "completed") {
        throw new Error(
          data.message || "Research could not be completed."
        );
      }

      setResult(data);
      setMessage("Research completed successfully!");
      await loadHistory();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openPreviousReport(item: HistoryItem) {
    try {
      const response = await fetch(
        `${API_URL}/research/${item.id}`
      );

      if (!response.ok) {
        throw new Error("Could not open this report.");
      }

      const data = await response.json();

      setQuery(data.query);

      setResult({
        id: data.id,
        status: data.status,
        topic: data.query,
        report: data.report || "No report available.",
      });

      setMessage("Previous research report loaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to open report."
      );
    }
  }

  async function deleteReport(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this research report?"
    );

    if (!confirmed) return;

    setDeletingId(id);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/research/${id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not delete report."
        );
      }

      setHistory((previous) =>
        previous.filter((item) => item.id !== id)
      );

      if (result?.id === id) {
        setResult(null);
      }

      setMessage("Research report deleted successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Delete failed."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // DOWNLOAD PDF OR DOCX
  async function downloadReport(format: "pdf" | "docx") {
    if (!result?.id) {
      setMessage(
        "Research ID is not available. Open a saved report first."
      );
      return;
    }

    setDownloadingFormat(format);
    setMessage(`Preparing your ${format.toUpperCase()} report...`);

    try {
      const response = await fetch(
        `${API_URL}/research/${result.id}/export/${format}`
      );

      if (!response.ok) {
        let errorMessage = "Report download failed.";

        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Keep default error message.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const fileUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `research_${result.id}.${format}`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(fileUrl);

      setMessage(
        `${format.toUpperCase()} report downloaded successfully!`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download report."
      );
    } finally {
      setDownloadingFormat(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6 hidden md:flex flex-col">

        <h1 className="text-2xl font-bold text-purple-700 mb-10">
          DeepResearch AI
        </h1>

        <nav className="space-y-4 flex-1">

          <button
            onClick={() => {
              setResult(null);
              setQuery("");
              setMessage("");
              setUploadedFile(null);
              setShowFileText(false);
            }}
            className="w-full text-left bg-purple-100 text-purple-700 p-3 rounded-lg font-medium"
          >
            + New Research
          </button>

          <p className="p-3 text-gray-600">Dashboard</p>

          <button
            onClick={loadHistory}
            className="w-full text-left p-3 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Research History
          </button>

          <p className="p-3 text-gray-600">Saved Reports</p>
          <p className="p-3 text-gray-600">Settings</p>

        </nav>

        <div className="bg-purple-50 rounded-xl p-4">
          <p className="font-semibold text-purple-800">
            Deep Research
          </p>
          <p className="text-sm text-gray-500 mt-2">
            AI-powered multi-source research.
          </p>
        </div>

      </aside>

      {/* MAIN DASHBOARD */}
      <main className="flex-1 p-5 md:p-10">

        <header className="flex justify-between items-center mb-12">

          <div>
            <p className="text-sm text-gray-500">
              Research Workspace
            </p>
            <h2 className="text-xl font-bold">Dashboard</h2>
          </div>

          <div className="flex items-center gap-3">

            <span
              className={`text-sm px-3 py-2 rounded-full ${
                backendStatus === "Connected"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              Backend: {backendStatus}
            </span>

            <div className="w-10 h-10 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center font-bold">
              U
            </div>

          </div>
        </header>

        <section className="max-w-5xl mx-auto">

          <p className="text-purple-600 font-semibold mb-3">
            AI POWERED AUTONOMOUS RESEARCH
          </p>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            What do you want to research?
          </h1>

          <p className="text-gray-500 mb-8">
            Turn complex questions into detailed research reports
            using AI and internet sources.
          </p>

          {/* RESEARCH INPUT */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your research topic or question..."
              disabled={loading}
              className="w-full h-36 resize-none outline-none text-gray-800 placeholder-gray-400 disabled:opacity-50"
            />

            {/* ATTACHMENT SECTION */}
            <div className="border-t border-gray-100 pt-4 mt-3">

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">

                <div className="flex flex-wrap items-center gap-3">

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || loading}
                    className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="text-lg">📎</span>
                    {uploading ? "Uploading..." : "Attach File"}
                  </button>

                  <span className="text-xs text-gray-400">
                    PDF, DOCX, TXT · Maximum 10 MB
                  </span>

                </div>

                <button
                  onClick={startResearch}
                  disabled={loading || backendStatus !== "Connected"}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-xl font-semibold transition"
                >
                  {loading ? "Researching..." : "Start Research →"}
                </button>

              </div>

              {/* UPLOADING INDICATOR */}
              {uploading && (
                <div className="mt-4 flex items-center gap-3 rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
                  Processing your document...
                </div>
              )}

              {/* UPLOADED FILE */}
              {uploadedFile && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>

                      <div>
                        <p className="font-semibold text-green-800">
                          {uploadedFile.filename}
                        </p>

                        <p className="text-xs text-green-700">
                          Text extracted successfully
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">

                      <button
                        onClick={() =>
                          setShowFileText(!showFileText)
                        }
                        className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100"
                      >
                        {showFileText ? "Hide Text" : "Preview Text"}
                      </button>

                      <button
                        onClick={removeUploadedFile}
                        className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>

                    </div>

                  </div>

                  {showFileText && (
                    <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-green-200 bg-white p-4 text-sm leading-6 text-gray-700">
                      {uploadedFile.extracted_text}
                    </div>
                  )}

                </div>
              )}

            </div>

            <p className="text-xs text-gray-400 mt-3">
              Powered by Ollama and Tavily
            </p>

          </div>

          {/* MESSAGE */}
          {message && !loading && (
            <div className="mt-5 p-4 bg-purple-50 text-purple-700 rounded-xl text-sm">
              {message}
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div className="mt-6 bg-purple-50 border border-purple-100 rounded-xl p-5">

              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />

                <p className="font-semibold text-purple-800">
                  AI is researching your topic...
                </p>
              </div>

              <p className="text-sm text-purple-600 mt-3">
                Generating research plan, searching internet sources
                and preparing your report. This may take several minutes.
              </p>

            </div>
          )}

          {/* RESEARCH RESULT */}
          {result && result.status === "completed" && (
            <section className="mt-10 space-y-6">

              <div className="bg-white border border-gray-200 rounded-2xl p-6">

                <div className="flex flex-wrap justify-between gap-3 items-center mb-4">

                  <h2 className="text-2xl font-bold">
                    Research Results
                  </h2>

                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                    Completed
                  </span>

                </div>

                <h3 className="text-xl font-semibold">
                  {result.topic}
                </h3>

                <p className="text-sm text-gray-500 mt-3">
                  Research ID: {result.id ?? "Not available"}
                  {" | "}
                  Sources: {result.sources_collected ?? result.sources?.length ?? "Not available"}
                </p>

                {/* EXPORT BUTTONS */}
                <div className="flex flex-wrap gap-3 mt-6">

                  <button
                    onClick={() => downloadReport("pdf")}
                    disabled={!result.id || downloadingFormat !== null}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-semibold transition"
                  >
                    {downloadingFormat === "pdf"
                      ? "Preparing PDF..."
                      : "↓ Download PDF"}
                  </button>

                  <button
                    onClick={() => downloadReport("docx")}
                    disabled={!result.id || downloadingFormat !== null}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-semibold transition"
                  >
                    {downloadingFormat === "docx"
                      ? "Preparing Word..."
                      : "↓ Download DOCX"}
                  </button>

                </div>

              </div>

              {/* RESEARCH PLAN */}
              {result.research_plan && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">

                  <h3 className="text-xl font-bold mb-4">
                    Research Plan
                  </h3>

                  <ol className="list-decimal pl-6 space-y-3">
                    {result.research_plan.map((topic, index) => (
                      <li key={index}>{topic}</li>
                    ))}
                  </ol>

                </div>
              )}

              {/* REPORT */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6">

                <h3 className="text-xl font-bold mb-5">
                  AI Research Report
                </h3>

                <div className="whitespace-pre-wrap break-words text-sm md:text-base leading-8 text-gray-700">
                  {result.report || "No report available."}
                </div>

              </div>

              {/* SOURCES */}
              {result.sources && result.sources.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6">

                  <h3 className="text-xl font-bold mb-5">
                    Research Sources
                  </h3>

                  <div className="space-y-4">

                    {result.sources.map((source) => (
                      <div
                        key={source.id}
                        className="border-b border-gray-100 pb-4 last:border-0"
                      >

                        <p className="text-sm text-purple-600 font-semibold">
                          {source.id}
                        </p>

                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-800 hover:text-purple-700 underline break-words"
                        >
                          {source.title}
                        </a>

                        {source.subtopic && (
                          <p className="text-xs text-gray-500 mt-1">
                            {source.subtopic}
                          </p>
                        )}

                      </div>
                    ))}

                  </div>
                </div>
              )}

            </section>
          )}

          {/* RESEARCH HISTORY */}
          <section className="mt-14">

            <div className="flex justify-between items-center mb-5">

              <h2 className="text-2xl font-bold">
                Research History
              </h2>

              <button
                onClick={loadHistory}
                className="text-sm text-purple-600 hover:underline"
              >
                Refresh
              </button>

            </div>

            {history.length === 0 ? (

              <div className="bg-white border border-gray-200 rounded-xl p-8 text-gray-500">
                Your research reports will appear here.
              </div>

            ) : (

              <div className="space-y-3">

                {history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:border-purple-300 transition"
                  >

                    <div className="flex flex-col md:flex-row justify-between gap-4">

                      <div className="flex-1">

                        <p className="font-semibold text-gray-800">
                          {item.query}
                        </p>

                        <p className="text-xs text-gray-400 mt-2">
                          Research ID: {item.id}
                          {item.created_at
                            ? ` | ${new Date(item.created_at).toLocaleString()}`
                            : ""}
                        </p>

                        <span className="inline-block mt-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          {item.status}
                        </span>

                      </div>

                      <div className="flex gap-2 items-center">

                        <button
                          onClick={() => openPreviousReport(item)}
                          className="px-4 py-2 text-sm rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200"
                        >
                          Open Report
                        </button>

                        <button
                          onClick={() => deleteReport(item.id)}
                          disabled={deletingId === item.id}
                          className="px-4 py-2 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === item.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>

                      </div>

                    </div>

                  </div>
                ))}

              </div>

            )}

          </section>

        </section>

      </main>

    </div>
  );
}
