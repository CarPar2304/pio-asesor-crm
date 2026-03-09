import { Toaster } from "sileo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CRMProvider } from "@/contexts/CRMContext";
import { CustomFieldsProvider } from "@/contexts/CustomFieldsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import CompanyProfilePage from "./pages/CompanyProfilePage";
import Tasks from "./pages/Tasks";
import Enrutador from "./pages/Enrutador";
import Stats from "./pages/Stats";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CRMProvider>
          <CustomFieldsProvider>
          <Toaster position="bottom-right" options={{ fill: "#171717", roundness: 14, styles: { title: "!text-white", description: "!text-white/75" } }} />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Index />} />
                <Route path="/empresa/:id" element={<CompanyProfilePage />} />
                <Route path="/tareas" element={<Tasks />} />
                <Route path="/enrutador" element={<Enrutador />} />
                <Route path="/stats" element={<Stats />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </CustomFieldsProvider>
        </CRMProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
