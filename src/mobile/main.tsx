// The bridge goes first: the interface reads window.api as soon as it loads.
import "./bridge";
import { createRoot } from "react-dom/client";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "../renderer/src/styles.css";
import "./mobile.css";
import { App } from "../renderer/src/App";

createRoot(document.getElementById("root")!).render(<App />);
