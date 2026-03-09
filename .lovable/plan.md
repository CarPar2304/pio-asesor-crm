
## Fix: Navigation Back to Pipeline

### Problem
In `CompanyProfilePage.tsx`, the back navigation is hardcoded:
```tsx
onBack={() => navigate('/')}  // Always goes to root
```

### Solution
Use browser history navigation:
```tsx
onBack={() => navigate(-1)}  // Goes back to previous page
```

### Files to Modify
- `src/pages/CompanyProfilePage.tsx`: Change `navigate('/')` to `navigate(-1)` on line 23

This will correctly return to `/portafolio?pipeline=offerId` when coming from the pipeline.
