import { query } from './db.js'
import { NotFoundError } from '../middlewares/errorHandler.js'

export async function getSupplierByEmail(email) {
  const { rows } = await query(
    'SELECT * FROM supplier WHERE contact_email = $1',
    [email]
  )

  if (rows.length === 0) {
    throw new NotFoundError('Supplier not found for current user')
  }

  return rows[0]
}

export async function getSupplierIdByEmail(email) {
  const supplier = await getSupplierByEmail(email)
  return supplier.id
}

export async function getRestaurantByEmail(email) {
  const { rows } = await query(
    'SELECT * FROM restaurant WHERE contact_email = $1',
    [email]
  )

  if (rows.length === 0) {
    throw new NotFoundError('Restaurant not found for current user')
  }

  return rows[0]
}

export async function getRestaurantIdByEmail(email) {
  const restaurant = await getRestaurantByEmail(email)
  return restaurant.id
}


