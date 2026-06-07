import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import HomePage from './pages/HomePage';
import ReadPage from './pages/ReadPage';
import LetterPage from './pages/LetterPage';
import WritePage from './pages/WritePage';
import AboutPage from './pages/AboutPage';
import MePage from './pages/MePage';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

// Reading and writing are gated on a connected Pod. About and Me are always
// reachable so visitors have an obvious place to discover the project and
// connect their Pod.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/read" element={<RequireAuth><ReadPage /></RequireAuth>} />
        <Route path="/read/:id" element={<RequireAuth><LetterPage /></RequireAuth>} />
        <Route path="/write" element={<RequireAuth><WritePage /></RequireAuth>} />
        <Route path="/write/:draftId" element={<RequireAuth><WritePage /></RequireAuth>} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth-callback" element={<AuthCallbackPage />} />
      </Route>
    </Routes>
  );
}
