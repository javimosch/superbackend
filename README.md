# NoteSyncer Landing Page

AI-powered Substack notes automation landing page built with Node.js, Express, and EJS.

## 🎯 Usage Modes

This application can run in two modes:

1. **Standalone Server** (default) - Full application with landing page
2. **Middleware Mode** - Integrate into existing Express.js apps

📖 See [MIDDLEWARE-README.md](MIDDLEWARE-README.md) for middleware integration guide.

## Features

- **Hero Section**: Eye-catching gradient background with animated SVG icons
- **Problem-Solution**: Clear before/after comparison
- **Feature Cards**: 3-column responsive grid showcasing key capabilities
- **Social Proof**: Testimonials and success metrics
- **Pricing**: Two-tier pricing with highlighted popular plan
- **Footer**: Complete navigation and legal links
- **Fully Responsive**: Mobile-first design with Tailwind CSS
- **Scroll Animations**: Smooth reveals and interactions
- **Performance Optimized**: Fast loading with lazy images and CDN

## Tech Stack

- **Backend**: Node.js + Express
- **Templating**: EJS (Embedded JavaScript)
- **Styling**: Tailwind CSS (via CDN)
- **Fonts**: Google Fonts (Inter)
- **Icons**: Heroicons (via Tailwind)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your MongoDB URI, Stripe keys, and JWT secrets
```

3. Make sure MongoDB is running locally or provide a MongoDB URI in .env

4. Run the development server:
```bash
npm run dev
```

5. Or run production:
```bash
npm start
```

6. Open your browser to:
```
http://localhost:3000
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user  
- `POST /api/auth/refresh-token` - Refresh JWT token
- `GET /api/auth/me` - Get current user (requires JWT)

### Billing (Stripe)
- `POST /api/billing/create-checkout-session` - Create Stripe checkout (requires JWT)
- `POST /api/billing/create-portal-session` - Create billing portal (requires JWT)
- `POST /api/billing/reconcile-subscription` - Reconcile subscription (requires JWT)
- `POST /api/stripe-webhook` - Stripe webhook handler

### Admin (Basic Auth)
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id/subscription` - Update user subscription
- `POST /api/admin/users/:id/reconcile` - Reconcile user subscription

## Project Structure

```
user-facing-app/
├── views/
│   ├── index.ejs              # Main page
│   └── partials/
│       ├── hero.ejs           # Hero section
│       ├── problem-solution.ejs
│       ├── features.ejs
│       ├── social-proof.ejs
│       ├── pricing.ejs
│       └── footer.ejs
├── public/
│   ├── css/
│   │   └── styles.css         # Custom animations
│   └── js/
│       └── animations.js      # Scroll reveals
├── server.js                  # Express server
└── package.json
```

## Design Guidelines

- **Colors**: 
  - Primary Blue: #4A90E2
  - Secondary Green: #7ED321
  - Background: #F5F7FA
- **Typography**: Inter font family
- **Spacing**: Consistent 48px gutters
- **Performance**: <2s load time target
- **Accessibility**: WCAG 2.1 AA compliant

## Customization

Edit the EJS partials in `views/partials/` to modify content.
Customize colors in the Tailwind config in `views/index.ejs`.
Add custom styles in `public/css/styles.css`.

## License

MIT