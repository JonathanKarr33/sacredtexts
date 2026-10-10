import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollTo; TanStack Router's scroll restoration calls it.
window.scrollTo = (() => {}) as typeof window.scrollTo;
