import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PublicPointsPage from "./PublicPointsPage.jsx";

const isPoints = window.location.pathname.startsWith("/tinh-diem-tai-xe-zalo") ||
                 window.location.pathname.startsWith("/xem-diem");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPoints ? <PublicPointsPage /> : <App />}
  </React.StrictMode>
);
