import rootRoutes from "@/routes/routes";
import React from "react";
import { useRoutes } from "react-router-dom";

const App: React.FC = () => {
  // const { currentUser, needsOnboarding, completeOnboarding, loading } =
  //   useAuth();
  const routing = useRoutes(rootRoutes);

  // Show app content for authenticated users
  return <>{routing}</>;
};

export default App;
