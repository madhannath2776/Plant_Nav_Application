import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";
import BrandLoader from "../components/BrandLoader";
import ErrorBoundary from "../components/ErrorBoundary";
import Navbar from "../components/Navbar";
import RewardWatcher from "../components/RewardWatcher";
import { useAuth } from "../contexts/AuthContext";
import Home from "../pages/Home";

const AddPlant = lazy(() => import("../pages/AddPlant"));
const Auth = lazy(() => import("../pages/Auth"));
const Leaderboard = lazy(() => import("../pages/Leaderboard"));
const MapExplore = lazy(() => import("../pages/MapExplore"));
const MyContributions = lazy(() => import("../pages/MyContributions"));
const PlantDetail = lazy(() => import("../pages/PlantDetail"));
const Profile = lazy(() => import("../pages/Profile"));
const AdminLayout = lazy(() => import("../admin/AdminLayout"));
const AdminDashboard = lazy(() => import("../admin/AdminDashboard"));

const pageTitles: [string, string][] = [
  ["/map", "Navigate"], ["/add", "Add Plant"], ["/profile", "Profile"], ["/score", "Score"],
  ["/contributions", "My Plants"], ["/plant", "Plant"], ["/auth", "Sign In"], ["/admin", "Admin"],
];

/** Root: error boundary, page title, short page transitions. */
function Root() {
  const location = useLocation();
  useEffect(() => {
    const match = pageTitles.find(([prefix]) => location.pathname.startsWith(prefix));
    document.title = match ? `Tree Navigator | ${match[1]}` : "Tree Navigator";
  }, [location.pathname]);
  return (
    <ErrorBoundary>
      <Suspense fallback={<BrandLoader fullscreen />}><Outlet /></Suspense>
    </ErrorBoundary>
  );
}

/** USER app shell. Admins never see it; they are sent to /admin. */
function UserLayout() {
  const location = useLocation();
  const { isAdmin, loading } = useAuth();
  if (loading) return <BrandLoader fullscreen />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return (
    <div className="app-shell">
      <Navbar />
      <main key={location.pathname} className="page-enter app-main">
        <Suspense fallback={<BrandLoader />}><Outlet /></Suspense>
      </main>
      <RewardWatcher />
    </div>
  );
}

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/auth" replace />;
}

/** ADMIN guard: role is verified by the database (is_admin), not by client state. */
function AdminGuard() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <BrandLoader fullscreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    Component: Root,
    children: [
      { path: "auth", Component: Auth },
      {
        Component: UserLayout,
        children: [
          { index: true, Component: Home },
          { path: "map", Component: MapExplore },
          { path: "score", Component: Leaderboard },
          { path: "plant/:id", Component: PlantDetail },
          {
            Component: ProtectedLayout,
            children: [
              { path: "add", Component: AddPlant },
              { path: "profile", Component: Profile },
              { path: "contributions", Component: MyContributions },
            ],
          },
        ],
      },
      {
        path: "admin",
        Component: AdminGuard,
        children: [{ Component: AdminLayout, children: [{ index: true, Component: AdminDashboard }] }],
      },
      { path: "find", element: <Navigate to="/map" replace /> },
      { path: "leaderboard", element: <Navigate to="/score" replace /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
