import { Outlet, NavLink } from 'react-router-dom';
import { Home, Utensils, Dumbbell } from 'lucide-react';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-kindra-50 flex flex-col font-sans text-kindra-950">
      {/* O conteúdo da página ativa será renderizado aqui */}
      <div className="flex-1 pb-20">
        <Outlet />
      </div>
      
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-kindra-100/90 backdrop-blur-xl border-t border-kindra-200/50 pb-safe pt-2 px-6">
        <div className="max-w-md mx-auto flex items-center justify-between pb-3 px-2">
          
          <NavLink 
            to="/home" 
            className={({ isActive }) => `flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-kindra-950 scale-105' : 'text-kindra-400 hover:text-kindra-600'}`}
          >
            <Home className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Início</span>
          </NavLink>
          
          <NavLink 
            to="/nutri" 
            className={({ isActive }) => `flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-kindra-950 scale-105' : 'text-kindra-400 hover:text-kindra-600'}`}
          >
            <Utensils className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Nutri</span>
          </NavLink>
          
          <NavLink 
            to="/workout" 
            className={({ isActive }) => `flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-kindra-950 scale-105' : 'text-kindra-400 hover:text-kindra-600'}`}
          >
            <Dumbbell className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Treino</span>
          </NavLink>
          
        </div>
      </nav>
    </div>
  );
}
