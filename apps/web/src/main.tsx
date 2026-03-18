import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./index.css";

import { isElectron } from "./env";
import { getRouter, createAppHistory } from "./router";

const history = createAppHistory(isElectron);
const router = getRouter(history);

document.title = "iara";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
