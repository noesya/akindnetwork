import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ReadPage from './pages/ReadPage';
import LetterPage from './pages/LetterPage';
import WritePage from './pages/WritePage';
import AboutPage from './pages/AboutPage';
import MePage from './pages/MePage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/read" element={<ReadPage />} />
        <Route path="/read/:id" element={<LetterPage />} />
        <Route path="/write" element={<WritePage />} />
        <Route path="/write/:draftId" element={<WritePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/me" element={<MePage />} />
      </Route>
    </Routes>
  );
}
