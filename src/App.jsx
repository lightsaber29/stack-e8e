import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import ExperienceList from './pages/ExperienceList.jsx'
import ExperienceForm from './pages/ExperienceForm.jsx'
import ExperienceDetail from './pages/ExperienceDetail.jsx'
import Search from './pages/Search.jsx'
import Chat from './pages/Chat.jsx'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Career Memory</div>
        <nav>
          <NavLink to="/search">검색</NavLink>
          <NavLink to="/experiences">경험 목록</NavLink>
          <NavLink to="/chat">대화로 정리</NavLink>
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/experiences" element={<ExperienceList />} />
          <Route path="/experiences/new" element={<ExperienceForm />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/experiences/:id/chat" element={<Chat />} />
          <Route path="/experiences/:id" element={<ExperienceDetail />} />
        </Routes>
      </main>
    </div>
  )
}
