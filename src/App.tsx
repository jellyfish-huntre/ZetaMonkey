import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useUserStore } from './store/userStore';
import GamePage from './routes/GamePage';
import ProfilePage from './routes/ProfilePage';
import LabPage from './routes/LabPage';
import MistakesPage from './routes/MistakesPage';
import DebugData from './routes/DebugData';
import Leaderboard from './components/Leaderboard/Leaderboard';

function App() {
  const { theme, checkSession } = useUserStore();

  // Initialize theme globally
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Check auth session globally
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/mistakes" element={<MistakesPage />} />
        <Route path="/debug" element={<DebugData />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
