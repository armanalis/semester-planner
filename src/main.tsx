import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import Root from './components/Root'
import './index.css'
import CoursePage from './pages/CoursePage'
import Planner from './pages/Planner'
import Review from './pages/Review'
import Stats from './pages/Stats'
import Welcome from './pages/Welcome'

const router = createBrowserRouter([
  {
    element: <Root />,
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
