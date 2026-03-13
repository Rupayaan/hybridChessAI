import { useState } from "react";
import Dashboard from "./Dashboard";
import ChessBoard from "./chessBoard";
import type { GameMode, TimeControl, RoomData } from "./types";

function App() {
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [timeControl, setTimeControl] = useState<TimeControl | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);

  const handleStartGame = (
    mode: GameMode,
    tc: TimeControl,
    room?: { roomId: string; roomCode: string; color: string }
  ) => {
    setGameMode(mode);
    setTimeControl(tc);
    setRoomData(room || null);
  };

  const handleBackToDashboard = () => {
    setGameMode(null);
    setTimeControl(null);
    setRoomData(null);
  };

  if (gameMode && timeControl) {
    return (
      <ChessBoard
        gameMode={gameMode}
        timeControl={timeControl}
        roomData={roomData}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return <Dashboard onStartGame={handleStartGame} />;
}

export default App;