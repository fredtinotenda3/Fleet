// tests/e2e/vehicles.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Vehicles Module E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should create a new vehicle', async ({ page }) => {
    await page.goto('/vehicles');
    await page.click('button:has-text("Add Vehicle")');
    
    await page.fill('input[name="license_plate"]', 'E2ETEST');
    await page.fill('input[name="make"]', 'E2E Make');
    await page.fill('input[name="model"]', 'E2E Model');
    await page.fill('input[name="year"]', '2024');
    await page.fill('input[name="vehicle_type"]', 'Car');
    await page.fill('input[name="purchase_date"]', '2024-01-01');
    await page.fill('input[name="fuel_type"]', 'Petrol');
    
    await page.click('button:has-text("Create Vehicle")');
    
    await expect(page.locator('text=E2ETEST')).toBeVisible();
  });

  test('should filter vehicles by status', async ({ page }) => {
    await page.goto('/vehicles');
    
    await page.selectOption('select[name="status"]', 'active');
    await page.click('button:has-text("Apply Filters")');
    
    await expect(page.locator('.vehicle-status')).toContainText('Active');
  });

  test('should edit a vehicle', async ({ page }) => {
    await page.goto('/vehicles');
    
    await page.click('button:has-text("Edit"):first');
    await page.fill('input[name="make"]', 'Updated Make');
    await page.click('button:has-text("Update")');
    
    await expect(page.locator('text=Updated Make')).toBeVisible();
  });

  test('should delete a vehicle', async ({ page }) => {
    await page.goto('/vehicles');
    
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Delete"):first');
    
    await expect(page.locator('text=Confirm Deletion')).not.toBeVisible();
  });
});