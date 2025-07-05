Fleet Management System
A robust Fleet Management System built with Next.js and MongoDB to help efficiently manage vehicles, track expenses, monitor fuel usage, and schedule maintenance reminders — all within a clean, responsive interface.

Features
Comprehensive vehicle management (add, edit, delete, view)

Detailed expense tracking with categories and descriptions

Fuel log recording with volume, cost, and odometer readings

Maintenance reminders with service schedules and notifications

Interactive dashboard with summary statistics and charts

Responsive design using Tailwind CSS and Lucide icons

Real-time updates and inline editing for seamless data management

Technology Stack
Frontend & Backend: Next.js (React) with API routes

Database: MongoDB for persistent data storage

Styling: Tailwind CSS

Icons: Lucide Icons

Notifications: Sonner Toast

Getting Started
Prerequisites
Node.js (v16+)

MongoDB instance (local or cloud)

Installation
bash
Copy
Edit
git clone https://github.com/fredtinotenda3/Fleet.git
cd Fleet
npm install
Environment Setup
Create a .env.local file in the project root and add your MongoDB connection string:

env
Copy
Edit
MONGODB_URI=your_mongodb_connection_string_here
Run the Development Server
bash
Copy
Edit
npm run dev
Open http://localhost:3000 in your browser to view the app.

Deployment
Deploy effortlessly on Vercel, the platform built for Next.js apps. Refer to the Next.js deployment guide for detailed instructions.

Contributing
Contributions are welcome! Please open issues and submit pull requests for improvements or new features.
