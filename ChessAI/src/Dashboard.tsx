import { useState } from "react";
import type { GameMode, GameState, TimeControl } from "./types";
import { TIME_CONTROLS } from "./types";
import "./Dashboard.scss";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

interface DashboardProps {
  onStartGame: (mode: GameMode, timeControl: TimeControl, roomData?: { roomId: string; roomCode: string; color: string }) => void;
}

type OnlineStep = "choose" | "create-timer" | "waiting" | "join";
type ColorChoice = "white" | "black" | "random";

export default function Dashboard({ onStartGame }: DashboardProps) {
  const [gameState, setGameState] = useState<GameState>("dashboard");
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [showCustomTimer, setShowCustomTimer] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(10);
  const [customIncrement, setCustomIncrement] = useState(0);

  const [onlineStep, setOnlineStep] = useState<OnlineStep>("choose");
  const [joinCode, setJoinCode] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [colorChoice, setColorChoice] = useState<ColorChoice>("white");

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    if (mode === "online") {
      setOnlineStep("choose");
      setGameState("timer-selection");
    } else {
      setGameState("timer-selection");
    }
    setShowCustomTimer(false);
  };

  const handleTimerSelect = (timeControl: TimeControl) => {
    if (selectedMode === "online") {
      handleCreateRoom(timeControl);
    } else if (selectedMode) {
      onStartGame(selectedMode, timeControl);
    }
  };

  const handleCustomTimerStart = () => {
    if (!selectedMode || customMinutes <= 0) return;
    const customControl: TimeControl = {
      id: `custom-${customMinutes}-${customIncrement}`,
      label: customIncrement > 0 ? `${customMinutes} + ${customIncrement}` : `${customMinutes} minutes`,
      minutes: customMinutes,
      increment: customIncrement,
    };
    if (selectedMode === "online") {
      handleCreateRoom(customControl);
    } else {
      onStartGame(selectedMode, customControl);
    }
  };

  const handleCreateRoom = async (timeControl: TimeControl) => {
    setIsLoading(true);
    setOnlineError("");
    try {
      const res = await fetch(`${API_BASE}/api/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutes: timeControl.minutes,
          increment: timeControl.increment,
          color: colorChoice,
        }),
      });
      const data = await res.json();

      onStartGame("online", timeControl, {
        roomId: data.room_id,
        roomCode: data.room_code,
        color: data.creator_color,
      });
    } catch {
      setOnlineError("Failed to create room. Is the server running?");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      setOnlineError("Please enter a room code");
      return;
    }
    setIsLoading(true);
    setOnlineError("");
    try {
      const res = await fetch(`${API_BASE}/api/join-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: joinCode.trim().toUpperCase() }),
      });

      if (!res.ok) {
        const err = await res.json();
        setOnlineError(err.detail || "Failed to join room");
        return;
      }

      const data = await res.json();
      const timeControl: TimeControl = {
        id: `online-${data.time_minutes}-${data.increment}`,
        label: data.increment > 0 ? `${data.time_minutes} + ${data.increment}` : `${data.time_minutes} minutes`,
        minutes: data.time_minutes,
        increment: data.increment,
      };

      onStartGame("online", timeControl, {
        roomId: data.room_id,
        roomCode: data.room_code,
        color: data.joiner_color,
      });
    } catch {
      setOnlineError("Failed to join room. Check the code and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (selectedMode === "online" && onlineStep !== "choose") {
      setOnlineStep("choose");
      setOnlineError("");
      return;
    }
    setGameState("dashboard");
    setSelectedMode(null);
    setShowCustomTimer(false);
    setOnlineError("");
  };

  const getModeLabel = () => {
    switch (selectedMode) {
      case "bot": return "🤖 vs Bot";
      case "local": return "👥 Local Game";
      case "online": return "🌐 Online";
      default: return "";
    }
  };

  // ---- Dashboard Screen ----
  if (gameState === "dashboard") {
    return (
      <div className="dashboard">
        <div className="dashboard-container">
          <h1 className="dashboard-title">♟️ Hybrid Chess AI</h1>
          <p className="dashboard-subtitle">Select Game Mode</p>
          <div className="mode-selection">
            <button className="mode-card mode-card--bot" onClick={() => handleModeSelect("bot")}>
              <div className="mode-icon">🤖</div>
              <h2>Play vs Bot</h2>
              <p>Challenge our AI opponent</p>
            </button>
            <button className="mode-card mode-card--local" onClick={() => handleModeSelect("local")}>
              <div className="mode-icon">👥</div>
              <h2>Local Game</h2>
              <p>Play on the same device</p>
            </button>
            <button className="mode-card mode-card--online" onClick={() => handleModeSelect("online")}>
              <div className="mode-icon">🌐</div>
              <h2>Online</h2>
              <p>Play with a friend</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Online: Choose Create or Join ----
  if (selectedMode === "online" && onlineStep === "choose") {
    return (
      <div className="timer-selection">
        <div className="timer-container">
          <button className="back-button" onClick={handleBack}>← Back</button>
          <h2 className="timer-title">Online Game</h2>
          <p className="timer-subtitle">Create a new game or join an existing one</p>
          <div className="online-choice">
            <button className="online-choice-card" onClick={() => setOnlineStep("create-timer")}>
              <div className="online-choice-icon">🏠</div>
              <h3>Create Room</h3>
              <p>Choose time control and get a code to share</p>
            </button>
            <button className="online-choice-card" onClick={() => setOnlineStep("join")}>
              <div className="online-choice-icon">🚪</div>
              <h3>Join Room</h3>
              <p>Enter a room code from your friend</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Online: Join Screen ----
  if (selectedMode === "online" && onlineStep === "join") {
    return (
      <div className="timer-selection">
        <div className="timer-container">
          <button className="back-button" onClick={handleBack}>← Back</button>
          <h2 className="timer-title">Join Game</h2>
          <p className="timer-subtitle">Enter the room code</p>
          <div className="join-panel">
            <input
              type="text"
              className="join-input"
              placeholder="Enter room code (e.g., A3F2B1)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            {onlineError && <p className="online-error">{onlineError}</p>}
            <button className="join-button" onClick={handleJoinRoom} disabled={isLoading}>
              {isLoading ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Timer Selection (bot/local/online-create) ----
  if (gameState === "timer-selection") {
    return (
      <div className="timer-selection">
        <div className="timer-container">
          <button className="back-button" onClick={handleBack}>← Back</button>
          <h2 className="timer-title">Select Time Control</h2>
          <p className="timer-subtitle">{getModeLabel()}</p>

          {/* Color Picker — Online only */}
          {selectedMode === "online" && (
            <div className="color-picker">
              <p className="color-picker-label">Play as</p>
              <div className="color-picker-options">
                <button
                  className={`color-option ${colorChoice === "white" ? "active" : ""}`}
                  onClick={() => setColorChoice("white")}
                  title="Play as White"
                >
                  <span className="color-piece">♔</span>
                  <span className="color-text">White</span>
                </button>
                <button
                  className={`color-option ${colorChoice === "random" ? "active" : ""}`}
                  onClick={() => setColorChoice("random")}
                  title="Random Color"
                >
                  <span className="color-piece">🎲</span>
                  <span className="color-text">Random</span>
                </button>
                <button
                  className={`color-option ${colorChoice === "black" ? "active" : ""}`}
                  onClick={() => setColorChoice("black")}
                  title="Play as Black"
                >
                  <span className="color-piece">♚</span>
                  <span className="color-text">Black</span>
                </button>
              </div>
            </div>
          )}

          {onlineError && <p className="online-error">{onlineError}</p>}

          <div className="timer-grid">
            {TIME_CONTROLS.map((control) => (
              <button
                key={control.id}
                className="timer-card"
                onClick={() => handleTimerSelect(control)}
                disabled={isLoading}
              >
                <div className="timer-card-time">{control.label}</div>
                <div className="timer-card-description">
                  {control.increment > 0 ? (
                    <>
                      <span>{control.minutes} min</span>
                      <span className="increment">+{control.increment}s/move</span>
                    </>
                  ) : (
                    <span>{control.minutes} minutes</span>
                  )}
                </div>
              </button>
            ))}
            <button
              className="timer-card timer-card--custom"
              onClick={() => setShowCustomTimer(!showCustomTimer)}
            >
              <div className="timer-card-time">⚙️ Custom</div>
              <div className="timer-card-description"><span>Set your own time</span></div>
            </button>
          </div>

          {showCustomTimer && (
            <div className="custom-timer-panel">
              <h3>Custom Time Control</h3>
              <div className="custom-timer-inputs">
                <div className="custom-input-group">
                  <label>Minutes per side</label>
                  <div className="input-with-buttons">
                    <button onClick={() => setCustomMinutes((prev) => Math.max(1, prev - 1))}>−</button>
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Math.max(1, Math.min(180, Number(e.target.value))))}
                    />
                    <button onClick={() => setCustomMinutes((prev) => Math.min(180, prev + 1))}>+</button>
                  </div>
                </div>
                <div className="custom-input-group">
                  <label>Increment (seconds/move)</label>
                  <div className="input-with-buttons">
                    <button onClick={() => setCustomIncrement((prev) => Math.max(0, prev - 1))}>−</button>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={customIncrement}
                      onChange={(e) => setCustomIncrement(Math.max(0, Math.min(60, Number(e.target.value))))}
                    />
                    <button onClick={() => setCustomIncrement((prev) => Math.min(60, prev + 1))}>+</button>
                  </div>
                </div>
              </div>
              <p className="custom-timer-preview">
                {customMinutes} min{customIncrement > 0 ? ` + ${customIncrement}s per move` : ""}
              </p>
              <button className="custom-timer-start" onClick={handleCustomTimerStart} disabled={isLoading}>
                {isLoading ? "Creating..." : "Start Game"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}