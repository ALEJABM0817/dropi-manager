import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Summary from './pages/Summary';
import StatusPage from './pages/StatusPage';
import GeoPage from './pages/GeoPage';
import Upload from './pages/Upload';
import ProductsPage from './pages/ProductsPage';
import Settings from './pages/Settings';
import AccumulatedSummary from './pages/AccumulatedSummary';
import DispatchErrorsPage from './pages/DispatchErrorsPage';
import RecommendationsPage from './pages/RecommendationsPage';
import TrendsPage from './pages/TrendsPage';
import MetaAudiencesPage from './pages/MetaAudiencesPage';

function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Summary />} />
                  <Route path="/accumulated" element={<AccumulatedSummary />} />
                  <Route path="/status" element={<StatusPage />} />
                  <Route path="/geo" element={<GeoPage />} />
                  <Route path="/dispatch-errors" element={<DispatchErrorsPage />} />
                  <Route path="/recommendations" element={<RecommendationsPage />} />
                  <Route path="/trends" element={<TrendsPage />} />
                  <Route path="/meta-audiences" element={<MetaAudiencesPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/upload" element={<Upload />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
