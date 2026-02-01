import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GamePage from './routes/GamePage';
import ProfilePage from './routes/ProfilePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
