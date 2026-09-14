import { lazy, Suspense } from 'react';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { MotionConfig } from 'motion/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';

import { AppLayout } from './components/layout/AppLayout';

const Landing = lazy(() => import('./pages/Landing').then((module) => ({ default: module.Landing })));
const NotFound = lazy(() => import('./pages/NotFound').then((module) => ({ default: module.NotFound })));

const Register = lazy(() =>
  import('./pages/Register').then((module) => ({ default: module.Register })),
);
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((module) => ({ default: module.ForgotPassword })),
);
const VerifyEmailPrompt = lazy(() =>
  import('./pages/VerifyEmailPrompt').then((module) => ({ default: module.VerifyEmailPrompt })),
);
const VerifyEmailConfirm = lazy(() =>
  import('./pages/VerifyEmailConfirm').then((module) => ({ default: module.VerifyEmailConfirm })),
);
const Onboarding = lazy(() =>
  import('./pages/Onboarding').then((module) => ({ default: module.Onboarding })),
);
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const WorkoutLive = lazy(() =>
  import('./pages/WorkoutLive').then((module) => ({ default: module.WorkoutLive })),
);
const ExerciseCatalog = lazy(() =>
  import('./pages/ExerciseCatalog').then((module) => ({ default: module.ExerciseCatalog })),
);
const Nutri = lazy(() => import('./pages/Nutri').then((module) => ({ default: module.Nutri })));
const Workout = lazy(() =>
  import('./pages/Workout').then((module) => ({ default: module.Workout })),
);

const RoutineBuilder = lazy(() => import('./pages/RoutineBuilder').then(module => ({ default: module.RoutineBuilder })));

const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const NutritionSettings = lazy(() => import('./pages/Settings').then(module => ({ default: module.NutritionSettings })));

export default function App() {
  const googleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || '';

  return (
    <MotionConfig reducedMotion="user">
      <GoogleOAuthProvider clientId={googleClientId}>
        <BrowserRouter>
          <Suspense
            fallback={
              <div
                role="status"
                className="min-h-dvh grid place-items-center text-sm text-kindra-500"
              >
                Carregando Kindra…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />
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
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/nutrition" element={<NutritionSettings />} />
                <Route path="/workout" element={<Workout />} />
              </Route>

              <Route path="/routines/new" element={<RoutineBuilder />} />
              <Route path="/routines/:routineId/edit" element={<RoutineBuilder />} />
              <Route path="/workout/live" element={<WorkoutLive />} />
              <Route path="/workout/exercises" element={<ExerciseCatalog />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </MotionConfig>
  );
}
