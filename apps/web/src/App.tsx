import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/layout/RequireAuth';
import { PageSpinner } from './components/ui/PageSpinner';

const Welcome = lazy(() => import('./pages/auth/Welcome'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const Onboarding = lazy(() => import('./pages/auth/Onboarding'));

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Nutrition = lazy(() => import('./pages/nutrition/Nutrition'));
const CaptureMeal = lazy(() => import('./pages/nutrition/CaptureMeal'));
const AnalysisResults = lazy(() => import('./pages/nutrition/AnalysisResults'));
const MealPlan = lazy(() => import('./pages/nutrition/MealPlan'));
const RecipeDetail = lazy(() => import('./pages/nutrition/RecipeDetail'));

const WorkoutLibrary = lazy(() => import('./pages/training/WorkoutLibrary'));
const WorkoutDetail = lazy(() => import('./pages/training/WorkoutDetail'));

const Progress = lazy(() => import('./pages/progress/Progress'));
const LogWeight = lazy(() => import('./pages/progress/LogWeight'));

const Coach = lazy(() => import('./pages/coach/Coach'));

const Settings = lazy(() => import('./pages/settings/Settings'));
const NotificationSettings = lazy(() => import('./pages/settings/NotificationSettings'));
const Memory = lazy(() => import('./pages/settings/Memory'));

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/sign-in" element={<SignIn />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/workouts" element={<WorkoutLibrary />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/coach" element={<Coach />} />
          </Route>

          <Route path="/nutrition/capture" element={<CaptureMeal />} />
          <Route path="/nutrition/analysis/:jobId" element={<AnalysisResults />} />
          <Route path="/nutrition/meal-plan" element={<MealPlan />} />
          <Route path="/recipes/:id" element={<RecipeDetail />} />
          <Route path="/workouts/:id" element={<WorkoutDetail />} />
          <Route path="/progress/log-weight" element={<LogWeight />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/memory" element={<Memory />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
