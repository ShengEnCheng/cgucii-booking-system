# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a space booking system for Chang Gung University Innovation Incubation Center (長庚大學創新育成中心空間預約系統). It's a Next.js application with Google Calendar integration that allows users to book meeting rooms and collaborative spaces.

## Key Architecture

- **Frontend**: Next.js with React, TypeScript, and Tailwind CSS
- **Backend**: Next.js API routes with Google Calendar API integration
- **Deployment**: Netlify with serverless functions
- **Calendar Integration**: Google Calendar API for real-time availability and booking management

## Common Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Test Netlify build locally
./build-netlify.sh
```

## Environment Configuration

Required environment variables:
- `GOOGLE_CREDENTIALS`: Google Calendar API service account credentials (JSON format, single line)
- `CALENDAR_ID`: Google Calendar ID (usually an email address)

Create `.env.local` for local development. Never commit credential files or environment variables.

## Key Components Structure

- **Spaces**: Defined in `src/data/spaces.ts` with predefined room configurations
- **Types**: Core interfaces in `src/types.ts` for Space and BookingFormData
- **API Routes**: 
  - `src/pages/api/submit-booking.ts`: Creates Google Calendar events
  - `src/pages/api/calendar-events.ts`: Fetches calendar availability
- **Components**: 
  - `src/components/BookingForm.tsx`: Main booking interface
  - `src/components/Calendar.tsx`: Calendar display component

## Google Calendar Integration

The system uses a service account to interact with Google Calendar:
- Service account credentials are stored in environment variables
- Each space has a `colorId` for visual differentiation in the calendar
- Events are created with detailed descriptions including user information
- Time zone is set to 'Asia/Taipei'

## Deployment Notes

- Uses Netlify with `@netlify/plugin-nextjs` plugin
- API routes are proxied to Netlify Functions via `netlify.toml` redirects
- Build output directory is `.next`
- Environment variables must be configured in Netlify dashboard

## File Structure Notes

- Main application code is in `src/` directory
- There's also a `booking-system/` subdirectory that appears to be a Next.js project structure
- Credential files like `service-account.json` and various Google credential files exist in root but should not be committed
- Static assets (room images) are in `public/images/`