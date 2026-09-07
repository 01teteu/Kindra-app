/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { VerifyEmailPrompt } from './pages/VerifyEmailPrompt';
import { VerifyEmailConfirm } from './pages/VerifyEmailConfirm';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { WorkoutLive } from './pages/WorkoutLive';
import { ExerciseCatalog } from './pages/ExerciseCatalog';
import { AppLayout } from './components/layout/AppLayout';
import { Nutri } from './pages/Nutri';
import { Workout } from './pages/Workout';

export default function App() {
  const googleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || '';

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<VerifyEmailPrompt />} />
          <Route path="/verificar-email" element={<VerifyEmailConfirm />} />
          <Route path="/onboarding" element={<Onboarding />} />
          
          {/* Rotas com Bottom Navigation */}
          <Route element={<AppLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/nutri" element={<Nutri />} />
            <Route path="/workout" element={<Workout />} />
          </Route>

          <Route path="/workout/live" element={<WorkoutLive />} />
          <Route path="/workout/exercises" element={<ExerciseCatalog />} />
          
          {/* Fallback temporário, redireciona para login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
