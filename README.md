# Clinical Trial Navigator

Using the project context already provided, create the initial foundation of the Clinical Trial Matching & Research Assistant.

Build

Create:

Application shell

Authentication pages

Main navigation

Dashboard placeholder

Responsive layout

Database foundation

User roles

Protected routes

Authentication

Create:

Login

Register

Forgot Password

Logout

Roles:

RESEARCHER

CLINICAL_COORDINATOR

ADMIN

Create protected routes for authenticated users.

Main Layout

Create a professional sidebar with:

Dashboard

Patients

Patient Processing

Clinical Trials

AI Matching

Matching Results

Documents

Compliance

Monitoring

Exports

Settings

Sidebar should collapse responsively.

Top bar should contain:

Page title

Search

Notifications placeholder

User profile menu

Dashboard

Create initial dashboard cards:

Total Patients

Total Clinical Trials

Active Trials

Potential Matches

Needs Review

Documents Processing

At this stage use real database counts where possible. Do not create fake hardcoded statistics if database data is available.

Design

Use:

React

TypeScript

Tailwind

shadcn/ui

Lucide icons

Create a professional medical/research SaaS appearance.

Do not implement AI or PDF processing yet.

Do not break the existing project structure.

After implementation, make sure:

Authentication works.

Protected routes work.

Navigation works.

The application builds successfully.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a1fa72e1-f63b-4454-a13c-49ea92cc084c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
