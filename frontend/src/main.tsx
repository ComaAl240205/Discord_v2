
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/styles.pc-only.css";
import "./styles/mobile-fixed.css";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
