import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explicit cleanup because globals: false disables RTL's auto-cleanup.
afterEach(() => cleanup());
