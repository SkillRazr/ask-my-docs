// Ask my docs: the web UI. Plain JavaScript in the browser, no framework and no
// build step. It talks to the same API you built: /ask/stream and /agent/stream.

const $ = (selector) => document.querySelector(selector);
const messages = $("#messages");
const form = $("#ask");
const input = $("#question");
const sendButton = $("#send");
const emptyState = $("#empty");

// localStorage can be blocked (private windows), so every use is wrapped.
const store = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // the page still works, it just forgets on reload
    }
  },
};

const state = {
  mode: store.get("mode") === "agent" ? "agent" : "ask",
  history: [], // quick answer: the conversation, sent with each question
  conversationId: store.get("conversationId"), // agent: the server keeps the conversation
  running: null, // the AbortController of the answer being written
};

// The browser sends the session cookie by itself, so requests need no identity
// headers. The cookie is HttpOnly: this script can't read it, and neither can an attacker's.
const headers = () => ({ "Content-Type": "application/json" });

// ---- Reading Server-Sent Events from a POST request ----
// EventSource only does GET, so read the response body and split it into events.
async function* readEvents(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end;
    while ((end = buffer.indexOf("\n\n")) > -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let type = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) yield { type, data: JSON.parse(data) };
    }
  }
}

async function post(path, body, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401) {
    showSignIn(); // the session expired
    throw new Error("Please sign in again.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? "Something went wrong. Please try again.");
  }
  return response;
}

// ---- One message on the screen ----
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function addUserMessage(text) {
  emptyState.remove();
  messages.append(el("div", "message user", text));
}

function addAnswer() {
  const box = el("article", "message bot");
  box.setAttribute("aria-busy", "true"); // screen readers wait for the whole answer
  const steps = el("ol", "steps");
  const text = el("div", "text");
  text.append(el("span", "typing", "Thinking…"));
  const note = el("p", "note");
  const sources = el("div", "sources");
  const footer = el("div", "footer");
  box.append(steps, text, note, sources, footer);
  messages.append(box);
  scrollDown();

  return {
    // Model text goes in with textContent, never innerHTML: an answer (or a document
    // it quotes) could contain HTML, and innerHTML would run it.
    setText(value, onCite) {
      text.replaceChildren();
      for (const part of value.split(/(\[\d+\])/)) {
        const cite = /^\[(\d+)\]$/.exec(part);
        if (cite && onCite) {
          const button = el("button", "cite", cite[1]);
          button.type = "button";
          button.setAttribute("aria-label", `Source ${cite[1]}`);
          button.onclick = () => onCite(Number(cite[1]));
          text.append(button);
        } else if (part) text.append(part);
      }
      scrollDown();
    },
    addStep(label, detail) {
      const item = el("li", "step running");
      item.append(el("span", "label", label));
      if (detail) item.append(el("span", "detail", detail));
      steps.append(item);
      scrollDown();
      return item;
    },
    finishStep(item, ok) {
      item.classList.remove("running");
      item.classList.add(ok ? "ok" : "failed");
    },
    note(message, kind = "warn") {
      note.textContent = message;
      note.className = `note ${kind}`;
    },
    // The agent wants to change something. Nothing happens until the user decides.
    approval({ actionId, tool, args }) {
      const card = el("div", "approval");
      const { title } = JSON.parse(args || "{}");
      card.append(
        el(
          "p",
          null,
          title
            ? `The agent wants to add a document: "${title}".`
            : `The agent wants to run ${tool}.`
        )
      );
      const yes = el("button", "primary", "Approve");
      const no = el("button", "ghost", "Reject");
      const decide = async (approve) => {
        yes.disabled = no.disabled = true;
        try {
          const response = await post(`/agent/actions/${actionId}`, {
            approve,
          });
          const result = await response.json();
          card.replaceChildren(
            el(
              "p",
              "note info",
              result.status === "approved"
                ? "Approved. The document will be searchable once it's indexed."
                : `Not done (${result.status}).`
            )
          );
        } catch (error) {
          card.append(el("p", "note error", error.message));
        }
      };
      yes.onclick = () => decide(true);
      no.onclick = () => decide(false);
      const row = el("div", "row");
      row.append(yes, no);
      card.append(row);
      steps.after(card);
      scrollDown();
    },
    showSources(list) {
      sources.replaceChildren();
      if (list.length === 0) return;
      sources.append(el("span", "sources-label", "Sources"));
      for (const source of list) {
        const button = el(
          "button",
          "source",
          source.number ? `${source.number}. ${source.title}` : source.title
        );
        button.type = "button";
        button.onclick = () => openSource(source);
        sources.append(button);
      }
    },
    feedback(mode, question, answer) {
      const label = el("span", "footer-label", "Was this helpful?");
      const yes = el("button", "ghost", "👍");
      const no = el("button", "ghost", "👎");
      yes.setAttribute("aria-label", "Helpful");
      no.setAttribute("aria-label", "Not helpful");
      const send = async (rating) => {
        footer.replaceChildren(
          el("span", "footer-label", "Thanks for the feedback.")
        );
        await post("/feedback", { mode, question, answer, rating }).catch(
          () => {}
        );
      };
      yes.onclick = () => send(1);
      no.onclick = () => send(-1);
      footer.replaceChildren(label, yes, no);
    },
    done() {
      box.setAttribute("aria-busy", "false");
      text.querySelector(".typing")?.remove();
    },
  };
}

function scrollDown() {
  messages.scrollTop = messages.scrollHeight;
}

// ---- Sources ----
const dialog = $("#passage");
$("#passage-close").onclick = () => dialog.close();

async function openSource(source) {
  $("#passage-title").textContent = source.title;
  $("#passage-text").textContent = source.content ?? "Loading…";
  dialog.showModal();
  if (source.content) return;
  // The agent only knows the passage id, so fetch the text.
  try {
    const response = await fetch(`/passages/${source.chunkId}`, {
      headers: headers(),
    });
    if (!response.ok) throw new Error();
    source.content = (await response.json()).content;
    $("#passage-text").textContent = source.content;
  } catch {
    $("#passage-text").textContent = "Couldn't load this passage.";
  }
}

// ---- Quick answer: the RAG pipeline, streamed ----
async function quickAnswer(question, view, signal) {
  const response = await post(
    "/ask/stream",
    { question, history: state.history.slice(-20) },
    signal
  );
  let text = "";
  let sources = [];
  const cite = (n) => {
    const source = sources.find((s) => s.number === n);
    if (source) openSource(source);
  };
  for await (const { type, data } of readEvents(response)) {
    if (type === "delta") {
      text += data.text;
      view.setText(text);
    } else if (type === "replace") {
      text = data.text; // the gateway's output check changed the answer (episode 8)
      view.setText(text);
    } else if (type === "done") {
      sources = data.sources;
      view.setText(text, cite);
      view.showSources(sources);
      if (data.found && sources.length === 0)
        view.note(
          "No sources back this answer. Check it before you rely on it."
        );
    } else if (type === "error") throw new Error(data.message);
  }
  state.history.push(
    { role: "user", content: question },
    { role: "assistant", content: text.slice(0, 2000) }
  );
  return text;
}

// ---- Agent: steps as they happen, then the answer ----
const STEP_LABELS = {
  docs__search_docs: "Searching the documents",
  docs__ask_docs: "Asking the documents",
  docs__list_documents: "Listing the documents",
  remember: "Saving a note about you",
  docs__add_document: "Adding a document",
};

async function agentAnswer(message, view, signal) {
  const response = await post(
    "/agent/stream",
    { message, conversationId: state.conversationId ?? undefined },
    signal
  );
  let text = "";
  const running = new Map(); // tool name -> its steps still running, oldest first
  for await (const { type, data } of readEvents(response)) {
    if (type === "tool_call") {
      const args = JSON.parse(data.args || "{}");
      const detail = Object.values(args).find((v) => typeof v === "string");
      const step = view.addStep(STEP_LABELS[data.tool] ?? data.tool, detail);
      running.set(data.tool, [...(running.get(data.tool) ?? []), step]);
    } else if (type === "tool_result") {
      const step = running.get(data.tool)?.shift();
      if (step) view.finishStep(step, data.ok);
    } else if (type === "delta") {
      text += data.text;
      view.setText(text);
    } else if (type === "approval_required") {
      const step = running.get(data.tool)?.shift();
      step?.classList.replace("running", "waiting");
      view.approval(data);
    } else if (type === "reset") {
      text = "";
      view.setText(text);
    } else if (type === "answer") {
      text = data.text;
      view.setText(text);
    } else if (type === "done") {
      state.conversationId = data.conversationId;
      store.set("conversationId", data.conversationId);
      view.showSources(data.sources);
      if (data.stopReason !== "answered")
        view.note("The agent stopped early.", "info");
    } else if (type === "error") throw new Error(data.message);
  }
  return text;
}

// ---- Sending a question ----
async function ask(question) {
  if (state.running) return;
  addUserMessage(question);
  const view = addAnswer();
  const mode = state.mode;
  state.running = new AbortController();
  setBusy(true);
  try {
    const answer =
      mode === "agent"
        ? await agentAnswer(question, view, state.running.signal)
        : await quickAnswer(question, view, state.running.signal);
    view.feedback(mode, question, answer);
  } catch (error) {
    if (state.running.signal.aborted) view.note("Stopped.", "info");
    else view.note(error.message, "error");
  } finally {
    view.done();
    state.running = null;
    setBusy(false);
  }
}

function setBusy(busy) {
  sendButton.textContent = busy ? "Stop" : "Send";
  sendButton.type = busy ? "button" : "submit";
  sendButton.classList.toggle("stop", busy);
}

sendButton.addEventListener("click", (event) => {
  if (!state.running) return; // a normal submit
  event.preventDefault();
  state.running.abort(); // closes the request, and the server stops the LLM calls
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  resize();
  ask(question);
});

// Enter sends, Shift+Enter adds a new line.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
const resize = () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
};
input.addEventListener("input", resize);

for (const button of document.querySelectorAll(".suggestions button"))
  button.onclick = () => ask(button.textContent);

// ---- Modes and new chats ----
function newChat() {
  state.running?.abort();
  state.history = [];
  state.conversationId = null;
  store.set("conversationId", null);
  messages.replaceChildren(emptyState);
}
$("#new-chat").onclick = newChat;

function setMode(mode) {
  state.mode = mode;
  store.set("mode", mode);
  for (const button of document.querySelectorAll(".modes button"))
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
}
for (const button of document.querySelectorAll(".modes button"))
  button.onclick = () => {
    if (button.dataset.mode === state.mode) return;
    newChat(); // each mode has its own kind of memory, so start fresh
    setMode(button.dataset.mode);
  };
setMode(state.mode);

// ---- Signing in ----
const signIn = $("#sign-in");
const app = [messages, form];

function showSignIn() {
  document.body.classList.add("signed-out");
  signIn.hidden = false;
  for (const part of app) part.hidden = true;
}

function showApp(user) {
  document.body.classList.remove("signed-out");
  signIn.hidden = true;
  for (const part of app) part.hidden = false;
  $("#who").textContent = `${user.email} · ${user.role}`;
}

const SIGN_IN_ERRORS = {
  "not-invited":
    "That Google account hasn't been invited. Ask an admin to add you.",
  "sign-in-expired": "The sign-in took too long. Please try again.",
  "sign-in-failed": "Sign-in failed. Please try again.",
};

async function start() {
  const error = new URLSearchParams(location.search).get("error");
  if (error) {
    $("#sign-in-error").textContent =
      SIGN_IN_ERRORS[error] ?? SIGN_IN_ERRORS["sign-in-failed"];
    $("#sign-in-error").hidden = false;
    history.replaceState(null, "", "/");
  }
  const me = await fetch("/auth/me");
  if (me.ok) return showApp(await me.json());
  const config = await (await fetch("/auth/config")).json();
  $("#google").hidden = !config.google;
  $("#dev-login").hidden = !config.devLogin;
  showSignIn();
}

$("#dev-login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/auth/dev-login", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: $("#dev-email").value }),
  });
  const result = await response.json();
  if (response.ok) {
    $("#sign-in-error").hidden = true;
    showApp(result);
  } else {
    $("#sign-in-error").textContent = result.error;
    $("#sign-in-error").hidden = false;
  }
});

$("#sign-out").onclick = async () => {
  await fetch("/auth/logout", { method: "POST" });
  newChat();
  store.set("conversationId", null);
  showSignIn();
  start();
};

// ---- Your data (episode 12) ----
const privacy = $("#privacy");
$("#my-data").onclick = () => {
  $("#privacy-status").textContent = "";
  $("#erase").dataset.confirm = "";
  $("#erase").textContent = "Delete my history";
  privacy.showModal();
};
$("#privacy-close").onclick = () => privacy.close();
$("#erase").onclick = async () => {
  const button = $("#erase");
  // Two taps, so nobody deletes everything by accident.
  if (!button.dataset.confirm) {
    button.dataset.confirm = "yes";
    button.textContent = "Tap again to delete everything";
    return;
  }
  const response = await fetch("/me/data", { method: "DELETE" });
  $("#privacy-status").textContent = response.ok
    ? "Deleted. Your conversations, memories and feedback are gone."
    : "Couldn't delete right now. Please try again.";
  if (response.ok) {
    newChat();
    store.set("conversationId", null);
  }
  button.dataset.confirm = "";
  button.textContent = "Delete my history";
};

start();
