import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import Root from './components/Root'
import RouteError from './components/RouteError'
import './index.css'
import CoursePage from './pages/CoursePage'
import Planner from './pages/Planner'
import Review from './pages/Review'
import Stats from './pages/Stats'
import Welcome from './pages/Welcome'

// After a new deploy, a tab opened earlier still asks for the old build's files (e.g. the notes preview),
// which no longer exist. Reload once to pick up the new build; notes are saved as you type, so nothing is lost.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('reloadedForNewBuild'))
  if (Date.now() - last < 10_000) return // already tried; let the error screen show instead of looping
  sessionStorage.setItem('reloadedForNewBuild', String(Date.now()))
  location.reload()
})

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/welcome', element: <Welcome /> },
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Planner /> },
          { path: '/review', element: <Review /> },
          { path: '/stats', element: <Stats /> },
          { path: '/course/:id', element: <CoursePage /> },
          { path: '*', element: <Planner /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
