import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { RequireAuth, RequireTargets, useProfileGate } from './components/layout/RequireAuth';
import { PageSpinner } from './components/ui/PageSpinner';

const Landing = lazy(() => import('./pages/landing/Landing'));
const FeaturesPage = lazy(() => import('./pages/landing/Features'));
const HowItWorksPage = lazy(() => import('./pages/landing/HowItWorks'));
/* Marketing page for the coach. Routed at /aqua-coach because /coach is the
   signed-in chat screen and must not be shadowed. */
const AquaCoachPage = lazy(() => import('./pages/landing/AquaCoach'));
const SafetyPage = lazy(() => import('./pages/landing/Safety'));
const PrivacyPage = lazy(() => import('./pages/legal/Privacy'));
const TermsPage = lazy(() => import('./pages/legal/Terms'));
const SupportPage = lazy(() => import('./pages/legal/Support'));
const Welcome = lazy(() => import('./pages/auth/Welcome'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
/* Wellness essentials — asked when a target is wanted, not before the app opens. */
const Setup = lazy(() => import('./pages/auth/Setup'));
const FirstRun = lazy(() => import('./pages/auth/FirstRun'));

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
const CoachSelect = lazy(() => import('./pages/coach/CoachSelect'));
const Challenges = lazy(() => import('./pages/challenges/Challenges'));

const PlanPage = lazy(() => import('./pages/upgrade/Plan'));

const Settings = lazy(() => import('./pages/settings/Settings'));
const NotificationSettings = lazy(() => import('./pages/settings/NotificationSettings'));
const Memory = lazy(() => import('./pages/settings/Memory'));

/**
 * `/` is the app's front door for everyone, which means it has to work before
 * the account has a wellness profile. The dashboard cannot — it is built around
 * a calorie ring — so an account without essentials gets the first-run home
 * instead. Nobody is redirected out of the app to a form.
 */
function HomeRoute() {
  const { hasProfile } = useProfileGate();
  return hasProfile ? <Dashboard /> : <FirstRun />;
}

/**
 * `/landing` was the marketing page's own URL before `/` started serving it
 * directly. It stays as a permanent alias — the address is in the wild, in
 * shared links and in anything already indexed — and forwards to the canonical
 * `/`, carrying the fragment across so `/landing#safety` still arrives at the
 * safety section rather than at the top of the page.
 */
function LandingAlias() {
  const { hash, search } = useLocation();
  return <Navigate to={{ pathname: '/', hash, search }} replace />;
}

export default function App() {
  // Last-resort boundary for screens outside AppLayout (auth, settings,
  // capture flows) — AppLayout has its own so the bottom nav survives there.
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageSpinner />}>
        <Routes>
        <Route path="/landing" element={<LandingAlias />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/aqua-coach" element={<AquaCoachPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/sign-in" element={<SignIn />} />

        {/* `publicIndex` makes `/` the marketing front door for signed-out web
            visitors while leaving it the app's home for everyone else — see
            RequireAuth. Cold traffic and crawlers land on the canonical URL
            with no redirect in between. */}
        <Route element={<RequireAuth publicIndex={<Landing />} />}>
          <Route path="/setup" element={<Setup />} />
          {/* Legacy entry point. Telegram's silent auto-login still aims here
              for an account with no profile; it now lands in the app rather
              than in a form. */}
          <Route path="/onboarding" element={<Navigate to="/" replace />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeRoute />} />
            <Route
              path="/nutrition"
              element={
                <RequireTargets title="Nutrition">
                  <Nutrition />
                </RequireTargets>
              }
            />
            <Route path="/workouts" element={<WorkoutLibrary />} />
            <Route
              path="/progress"
              element={
                <RequireTargets title="Progress">
                  <Progress />
                </RequireTargets>
              }
            />
            <Route path="/coach" element={<Coach />} />
          </Route>

          <Route path="/nutrition/capture" element={<CaptureMeal />} />
          <Route path="/nutrition/analysis/:jobId" element={<AnalysisResults />} />
          <Route
            path="/nutrition/meal-plan"
            element={
              <RequireTargets title="Meal plan" back>
                <MealPlan />
              </RequireTargets>
            }
          />
          <Route path="/recipes/:id" element={<RecipeDetail />} />
          <Route path="/workouts/:id" element={<WorkoutDetail />} />
          <Route path="/progress/log-weight" element={<LogWeight />} />
          <Route path="/challenges" element={<Challenges />} />
          {/* Character select renders its own header and nav, like /settings. */}
          <Route path="/coach/select" element={<CoachSelect />} />
          {/* Renders its own header and nav, so it sits outside AppLayout —
              same as /settings. Deliberately NOT behind RequireTargets: what
              your plan allows does not depend on having entered a height. */}
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/memory" element={<Memory />} />
        </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
