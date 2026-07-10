import { useEffect, useState } from "react";
import { History } from "../../pages/History";
import { Sidebar } from "../../components/Sidebar";
import Settings from "../../pages/Settings";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { Toaster } from "react-hot-toast";
import Analytics from "../../pages/Analytics";

const routes = new Set(["/", "/analytics", "/settings"]);

const getCurrentPath = () => {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return routes.has(path) ? path : "/";
};

const App = () => {
  const [currentPath, setCurrentPath] = useState(getCurrentPath);

  useEffect(() => {
    const handleHashChange = () => {
      const path = getCurrentPath();
      setCurrentPath(path);
      if (!routes.has(window.location.hash.replace(/^#/, "") || "/")) {
        window.history.replaceState(null, "", "#/");
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const page =
    currentPath === "/analytics" ? (
      <Analytics />
    ) : currentPath === "/settings" ? (
      <Settings />
    ) : (
      <History />
    );

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex min-h-screen dark:bg-[#0a0a0a] dark:text-neutral-100">
        <Sidebar activePath={currentPath} />
        <main className="ml-40 w-full transition-all duration-300">{page}</main>
        <ScrollToTopButton />
      </div>
    </>
  );
};

export default App;
