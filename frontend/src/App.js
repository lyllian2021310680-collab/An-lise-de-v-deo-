import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/context/ThemeContext";
import Home from "@/pages/Home";
import Gallery from "@/pages/Gallery";
import AddVideo from "@/pages/AddVideo";
import Athletes from "@/pages/Athletes";
import AthleteDossier from "@/pages/AthleteDossier";
import Analyze from "@/pages/Analyze";
import Reports from "@/pages/Reports";
import AIAnalysis from "@/pages/AIAnalysis";
import SettingsPage from "@/pages/Settings";

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/galeria" element={<Gallery />} />
            <Route path="/adicionar" element={<AddVideo />} />
            <Route path="/atletas" element={<Athletes />} />
            <Route path="/atletas/:id" element={<AthleteDossier />} />
            <Route path="/analisar/:videoId" element={<Analyze />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/ia" element={<AIAnalysis />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </div>
    </ThemeProvider>
  );
}

export default App;
