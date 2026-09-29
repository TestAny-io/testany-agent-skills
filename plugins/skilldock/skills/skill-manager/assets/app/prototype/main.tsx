// [PROTOTYPE] All operations use in-memory fixtures; nothing manages local files.
import { createRoot } from "react-dom/client";
import Prototype from "./Prototype";
import icon from "../src/native-icon.svg";
import "./prototype.css";

(document.querySelector('link[rel="icon"]') as HTMLLinkElement).href = icon;
createRoot(document.getElementById("skilldock-prototype")!).render(<Prototype />);
