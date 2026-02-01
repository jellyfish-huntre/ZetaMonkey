import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GamePage from './routes/GamePage';
import ProfilePage from './routes/ProfilePage';
import Leaderboard from './components/Leaderboard/Leaderboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
