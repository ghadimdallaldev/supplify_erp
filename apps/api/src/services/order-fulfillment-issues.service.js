import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { getOrCreateConversation, postConversationMessage } from '../lib/chat-conversation.js'
import { getOrderForAmendment } from './order-amendments.service.js'
import { proposeOrderSubstitution } from './product-substitutes.service.js'
import { notifyTenantUsers } from './notification.service.js'

function formatQty(qty, unit) {
  const n = parseFloat(qty)
  if (Number.isNaN(n)) return ''
  return unit ? `${n} ${unit}` : String(n)
}

export function buildShortageMessage({
  productName,
  orderedQuantity,
  orderedUnit,
  availableQuantity,
  availableUnit,
  replacementProductName,
  replacementQuantity,
  replacementUnit,
  customNote,
}) {
  const ordered = formatQty(orderedQuantity, orderedUnit)
  const parts = [`Hi, you ordered ${ordered} of ${productName || 'this item'}.`]

  if (availableQuantity != null && parseFloat(availableQuantity) >= 0) {
    parts.push(
      `We only have ${formatQty(availableQuantity, availableUnit || orderedUnit)} available.`
    )
  }

  if (replacementProductName) {
    parts.push(
      `Suggested replacement: ${replacementProductName} (${formatQty(replacementQuantity, replacementUnit)}).`
    )
  } else if (availableQuantity == null) {
    parts.push('We cannot fulfill the full quantity.')
  }

  parts.push('Do you want us to proceed with this change?')
  if (customNote?.trim()) parts.push(customNote.trim())
  return parts.join(' ')
}

async function loadOrderItem(orderId, orderItemId, supplierId) {
  const { rows } = await query(
    `
    SELECT oi.*, p.name AS product_name, p.unit AS product_unit, o.restaurant_id
    FROM order_item oi
    JOIN product p ON p.id = oi.product_id
    JOIN customer_order o ON o.id = oi.order_id
    WHERE oi.id = $1 AND oi.order_id = $2 AND oi.supplier_id = $3
    `,
    [orderItemId, orderId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Order item not found')
  return rows[0]
}

export async function listFulfillmentIssues(orderId, supplierId) {
  const { rows } = await query(
    `
    SELECT fi.*, p.name AS replacement_product_name
    FROM order_fulfillment_issue fi
    LEFT JOIN product p ON p.id = fi.replacement_product_id
    WHERE fi.order_id = $1 AND fi.supplier_id = $2
    ORDER BY fi.created_at DESC
    `,
    [orderId, supplierId]
  )
  return rows
}

export async function createShortageIssue({
  orderId,
  supplierId,
  orderItemId,
  createdByUserId,
  shortageQuantity,
  availableQuantity,
  replacementProductId,
  replacementQuantity,
  replacementUnit,
  message: customNote,
  openChat = true,
}) {
  const item = await loadOrderItem(orderId, orderItemId, supplierId)
  const order = await getOrderForAmendment(orderId)
  if (order.supplier_id !== supplierId) throw new ValidationError('Access denied')

  let replacementName = null
  if (replacementProductId) {
    const { rows: rp } = await query(`SELECT name, unit FROM product WHERE id = $1`, [
      replacementProductId,
    ])
    replacementName = rp[0]?.name
  }

  const chatMessage = buildShortageMessage({
    productName: item.product_name,
    orderedQuantity: item.quantity,
    orderedUnit: item.product_unit,
    availableQuantity,
    availableUnit: item.product_unit,
    replacementProductName: replacementName,
    replacementQuantity,
    replacementUnit: replacementUnit || item.product_unit,
    customNote,
  })

  return withTransaction(async (client) => {
    const conversation = openChat
      ? await getOrCreateConversation(supplierId, item.restaurant_id, { enforceOpenLimit: false })
      : null

    let messageRow = null
    if (conversation) {
      messageRow = await postConversationMessage({
        conversationId: conversation.id,
        senderType: 'SUPPLIER',
        senderId: supplierId,
        content: chatMessage,
        messageType: 'ORDER_REFERENCE',
        orderId,
        client,
      })
    }

    const { rows } = await client.query(
      `
      INSERT INTO order_fulfillment_issue (
        order_id, order_item_id, supplier_id, restaurant_id, created_by,
        issue_type, status,
        ordered_quantity, shortage_quantity, available_quantity,
        replacement_product_id, replacement_quantity, replacement_unit,
        message, conversation_id, message_id
      ) VALUES ($1,$2,$3,$4,$5,'shortage','shortage_reported',$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
      `,
      [
        orderId,
        orderItemId,
        supplierId,
        item.restaurant_id,
        createdByUserId,
        item.quantity,
        shortageQuantity ?? null,
        availableQuantity ?? null,
        replacementProductId || null,
        replacementQuantity ?? null,
        replacementUnit || item.product_unit,
        customNote || chatMessage,
        conversation?.id || null,
        messageRow?.id || null,
      ]
    )

    const issue = rows[0]

    await notifyTenantUsers({
      tenantId: item.restaurant_id,
      tenantType: 'RESTAURANT',
      notificationType: 'ORDER',
      notificationCategory: 'order_fulfillment_issue',
      title: 'Supplier reported a shortage',
      message: chatMessage.slice(0, 280),
      referenceId: orderId,
      referenceType: conversation ? 'CONVERSATION' : 'ORDER',
      metadata: {
        link: conversation ? `/app/chat?conversation=${conversation.id}` : `/app/orders/${orderId}`,
        issueId: issue.id,
        issueType: 'shortage',
      },
    })

    return { issue, conversation, message: messageRow }
  })
}

export async function createSubstitutionIssue({
  orderId,
  supplierId,
  orderItemId,
  createdByUserId,
  substituteProductId,
  replacementQuantity,
  replacementUnit,
  availableQuantity,
  message: customNote,
  proposeAmendment = true,
}) {
  const item = await loadOrderItem(orderId, orderItemId, supplierId)

  let replacementName = null
  let replacementUnitResolved = replacementUnit
  if (substituteProductId) {
    const { rows: rp } = await query(`SELECT name, unit FROM product WHERE id = $1`, [
      substituteProductId,
    ])
    replacementName = rp[0]?.name
    replacementUnitResolved = replacementUnitResolved || rp[0]?.unit
  }

  const chatMessage = buildShortageMessage({
    productName: item.product_name,
    orderedQuantity: item.quantity,
    orderedUnit: item.product_unit,
    availableQuantity,
    availableUnit: item.product_unit,
    replacementProductName: replacementName,
    replacementQuantity,
    replacementUnit: replacementUnitResolved,
    customNote,
  })

  let amendmentResult = null
  if (proposeAmendment && substituteProductId) {
    amendmentResult = await proposeOrderSubstitution({
      orderId,
      supplierId,
      orderItemId,
      substituteProductId,
      requestedByUserId: createdByUserId,
      description: customNote || chatMessage,
    })
  }

  const conversation = await getOrCreateConversation(supplierId, item.restaurant_id, {
    enforceOpenLimit: false,
  })
  const messageRow = await postConversationMessage({
    conversationId: conversation.id,
    senderType: 'SUPPLIER',
    senderId: supplierId,
    content: chatMessage,
    messageType: 'ORDER_REFERENCE',
    orderId,
  })

  const status = amendmentResult ? 'waiting_restaurant_approval' : 'substitution_suggested'

  const { rows } = await query(
    `
    INSERT INTO order_fulfillment_issue (
      order_id, order_item_id, supplier_id, restaurant_id, created_by,
      issue_type, status,
      ordered_quantity, available_quantity,
      replacement_product_id, replacement_quantity, replacement_unit,
      message, amendment_id, conversation_id, message_id
    ) VALUES ($1,$2,$3,$4,$5,'substitution',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
    `,
    [
      orderId,
      orderItemId,
      supplierId,
      item.restaurant_id,
      createdByUserId,
      status,
      item.quantity,
      availableQuantity ?? null,
      substituteProductId || null,
      replacementQuantity ?? null,
      replacementUnitResolved || item.product_unit,
      customNote || chatMessage,
      amendmentResult?.amendmentId || null,
      conversation.id,
      messageRow.id,
    ]
  )

  await notifyTenantUsers({
    tenantId: item.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'ORDER',
    notificationCategory: 'order_fulfillment_issue',
    title: 'Substitution suggested by supplier',
    message: chatMessage.slice(0, 280),
    referenceId: conversation.id,
    referenceType: 'CONVERSATION',
    metadata: {
      link: `/app/chat?conversation=${conversation.id}`,
      issueId: rows[0].id,
      issueType: 'substitution',
    },
  })

  return { issue: rows[0], conversation, message: messageRow, amendment: amendmentResult }
}

export async function openFulfillmentChat({
  orderId,
  supplierId,
  orderItemId,
  createdByUserId,
  message,
}) {
  const item = await loadOrderItem(orderId, orderItemId, supplierId)
  const conversation = await getOrCreateConversation(supplierId, item.restaurant_id, {
    enforceOpenLimit: false,
  })
  const content =
    message?.trim() ||
    `Hi, regarding your order for ${item.product_name || 'an item'} — we need to discuss fulfillment options.`
  const messageRow = await postConversationMessage({
    conversationId: conversation.id,
    senderType: 'SUPPLIER',
    senderId: supplierId,
    content,
    messageType: 'ORDER_REFERENCE',
    orderId,
  })

  await notifyTenantUsers({
    tenantId: item.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'CHAT',
    notificationCategory: 'message_received',
    title: 'Message from your supplier',
    message: content.slice(0, 280),
    referenceId: conversation.id,
    referenceType: 'CONVERSATION',
    metadata: { link: `/app/chat?conversation=${conversation.id}` },
  })

  return { conversation, message: messageRow }
}
