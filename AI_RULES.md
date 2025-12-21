# AI Rules for Blaze Analyzer

This document outlines the technical stack and guidelines for using libraries within the Blaze Analyzer application.

## Tech Stack

*   **Frontend Framework**: React.js
*   **Language**: TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS
*   **UI Library**: shadcn/ui (built on Radix UI primitives)
*   **Routing**: React Router
*   **Backend/Database**: Supabase (for data storage, authentication, and Edge Functions)
*   **Data Fetching**: React Query (`@tanstack/react-query`)
*   **Charting**: Recharts
*   **Icons**: Lucide React
*   **Notifications**: Sonner (for toasts)

## Library Usage Rules

*   **UI Components**: Always use `shadcn/ui` components for building the user interface. If a specific component is not available or requires custom logic, create a new component that wraps or extends `shadcn/ui` primitives, ensuring consistent styling with Tailwind CSS.
*   **Styling**: Exclusively use Tailwind CSS classes for all styling. Avoid inline styles or custom CSS files unless absolutely necessary for complex, unique animations or global base styles.
*   **Routing**: Use `react-router-dom` for all client-side navigation. All main application routes should be defined in `src/App.tsx`.
*   **State Management**: For local component state, use React's built-in hooks (`useState`, `useReducer`). For global or asynchronous state (especially API data), leverage `useQuery` and `useMutation` from `@tanstack/react-query`.
*   **Backend Interaction**: All interactions with the backend (database, authentication, Edge Functions) should be performed using the `supabase` client from `@supabase/supabase-js`.
*   **Forms & Validation**: Use `react-hook-form` for managing form state and validation, paired with `zod` for schema-based validation.
*   **Date Handling**: Use `date-fns` for any date formatting, parsing, or manipulation tasks.
*   **Icons**: Integrate icons from the `lucide-react` library.
*   **Charts**: Use `recharts` for all data visualization and charting requirements.
*   **Notifications**: Use `sonner` for displaying user-facing toast notifications.
*   **PWA Features**: `vite-plugin-pwa` is configured for Progressive Web App capabilities.