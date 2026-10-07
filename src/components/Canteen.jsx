import { useEffect, useMemo, useState } from 'react'
import { Check, CircleAlert, Clock3, Minus, Plus, Search, ShoppingBag, Utensils, X } from 'lucide-react'
import { api } from '../api/client'

const STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED']
const STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']
const CATEGORIES = {
  Veg: ['Tea & Coffee', 'Sandwich', 'Shakes & Drinks', 'Burger', 'Patty & Samosa', 'Paneer Momos', 'Maggi', 'French Fries', 'Pizza', 'Chinese', 'Add On'],
  'Non-Veg': ['Burger', 'Sandwich', 'Chicken Momos', 'Eggs', 'Patty', 'Continental', 'Add On', 'Chinese'],
}

export default function Canteen({ user, onNotify, onLogout }) {
  const manager = user.role === 'Canteen Staff'
  const customer = ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration'].includes(user.role)
  const [items, setItems] = useState([])
  const [orders, setOrders] = useState([])
  const [notifications, setNotifications] = useState([])
  const [cart, setCart] = useState({})
  const [diet, setDiet] = useState('All')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState(manager ? 'orders' : 'menu')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    setError('')
    try {
      const [menu, orderResult, notificationResult] = await Promise.all([
        manager ? Promise.resolve({ items: [] }) : api('/api/canteen/menu'),
        customer || manager ? api('/api/canteen/orders') : Promise.resolve({ orders: [] }),
        user.role === 'Canteen Staff' ? api('/api/notifications') : Promise.resolve({ notifications: [] }),
      ])
      setItems(menu.items)
      setOrders(orderResult.orders)
      setNotifications(notificationResult.notifications || [])
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    if (user.role !== 'Canteen Staff') return undefined
    const timer = window.setInterval(refresh, 15000)
    return () => window.clearInterval(timer)
  }, [customer, manager, user.role])

  const categories = diet === 'All' ? ['All', ...new Set(Object.values(CATEGORIES).flat())] : ['All', ...CATEGORIES[diet]]
  const visibleItems = useMemo(() => items.filter((item) =>
    (diet === 'All' || item.diet === diet)
    && (category === 'All' || item.category === category)
    && (!search || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(search.toLowerCase()))), [items, diet, category, search])
  const cartLines = Object.values(cart)
  const total = cartLines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const visibleOrders = manager
    ? orders.filter((order) => statusFilter === 'ALL' || order.status === statusFilter)
    : orders

  function addItem(item) {
    if (!item.available) return
    setCart((current) => {
      const existing = current[item.id]
      return { ...current, [item.id]: { ...item, quantity: (existing?.quantity || 0) + 1 } }
    })
  }

  function changeQuantity(id, amount) {
    setCart((current) => {
      const next = { ...current }
      const quantity = (next[id]?.quantity || 0) + amount
      if (quantity <= 0) delete next[id]
      else next[id] = { ...next[id], quantity }
      return next
    })
  }

  async function placeOrder() {
    if (!cartLines.length) return
    setBusy('place-order')
    setError('')
    try {
      const result = await api('/api/canteen/orders', {
        method: 'POST',
        body: { items: cartLines.map(({ id, size, quantity, price }) => ({ itemId: id, size, quantity, price })) },
      })
      setOrders((current) => [result.order, ...current])
      setCart({})
      setTab('orders')
      onNotify(`${result.order.orderNumber} placed successfully.`)
    } catch (reason) { setError(reason.message); await refresh() } finally { setBusy('') }
  }

  async function updateOrder(order, status) {
    setBusy(order.id)
    setError('')
    try {
      const result = await api(`/api/canteen/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status } })
      setOrders((current) => current.map((entry) => entry.id === order.id ? result.order : entry))
      onNotify(`${order.orderNumber} · ${status.toLowerCase()}.`)
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  async function saveItem(event) {
    event.preventDefault()
    setBusy('save-item')
    setError('')
    try {
      const body = { ...editing, price: Number(editing.price), available: Boolean(editing.available) }
      const result = editing.id
        ? await api(`/api/canteen/menu/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body })
        : await api('/api/canteen/menu', { method: 'POST', body })
      setItems((current) => editing.id ? current.map((item) => item.id === result.item.id ? result.item : item) : [result.item, ...current])
      setEditing(null)
      onNotify(editing.id ? 'Menu item updated.' : 'Food item added to the menu.')
    } catch (reason) { setError(reason.message) } finally { setBusy('') }
  }

  function editItem(item = null) {
    setEditing(item ? { ...item } : { name: '', diet: 'Veg', category: 'Tea & Coffee', price: '', size: '', description: '', imageUrl: '', available: true })
  }

  return <div className="module-page page-enter canteen-page">
    <div className="module-breadcrumb">CAMPUS <span>›</span> CANTEEN</div>
    <section className="module-hero canteen-hero">
      <div className="module-title-area"><span className="module-icon"><Utensils size={20}/></span><span className="module-eyebrow">PURAN MURTI VIDYAPEETH · FRESHLY MADE</span><h1>{manager ? 'Canteen dashboard' : 'Canteen'}<span className="module-title-period">.</span></h1><p>{manager ? 'Review incoming orders and update each order through delivery.' : 'Browse the menu, choose your favourites and pre-order from campus.'}</p></div>
      {user.role === 'Canteen Staff' && <button className="canteen-signout" onClick={onLogout}>Sign out</button>}
    </section>
    {error && <div className="management-alert canteen-alert" role="alert"><CircleAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {user.role === 'Canteen Staff' && notifications.some((notification) => !notification.readAt) && <section className="canteen-notifications"><span className="section-eyebrow">ORDER UPDATES</span>{notifications.filter((notification) => !notification.readAt).slice(0, 4).map((notification) => <button key={notification.id} onClick={async () => { try { await api(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: 'PATCH', body: {} }); setNotifications((current) => current.map((entry) => entry.id === notification.id ? { ...entry, readAt: new Date().toISOString() } : entry)); if (notification.target === 'canteen') setTab('orders') } catch (reason) { setError(reason.message) } }}><strong>{notification.title}</strong><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()} · View</small></button>)}</section>}
    {!manager && <div className="canteen-tabs" role="tablist">
      <button className={tab === 'menu' ? 'canteen-tab-active' : ''} onClick={() => setTab('menu')}><Utensils size={14}/>Menu</button>
      <button className={tab === 'orders' ? 'canteen-tab-active' : ''} onClick={() => setTab('orders')}><ShoppingBag size={14}/>My Orders{orders.length > 0 && <span>{orders.length}</span>}</button>
    </div>}
    {!manager && tab === 'menu' && <>
      <div className="canteen-filters">
        <label className="module-search canteen-search"><Search size={15}/><input aria-label="Search food" placeholder="Search the menu…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        <div className="canteen-diet-filters" aria-label="Filter by menu type">{['All', 'Veg', 'Non-Veg'].map((value) => <button key={value} className={diet === value ? 'canteen-filter-active' : ''} onClick={() => { setDiet(value); setCategory('All') }}>{value}</button>)}</div>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All categories</option>{categories.filter((value) => value !== 'All').map((value, index) => <option key={`${value}-${index}`} value={value}>{value}</option>)}</select>
        {manager && <button className="module-primary" onClick={() => editItem()}><Plus size={14}/> Add food item</button>}
      </div>
      {loading ? <div className="management-state"><span className="loading-spinner"/>Loading canteen menu…</div> : visibleItems.length === 0 ? <div className="management-state">{manager ? 'No menu items match your filters.' : 'No available items match your search.'}</div> : <div className="canteen-food-grid">{visibleItems.map((item) => <article className={`canteen-food-card ${!item.available ? 'canteen-unavailable' : ''}`} key={item.id}>
        {item.imageUrl ? <img className="canteen-food-image" src={item.imageUrl} alt="" loading="lazy"/> : <div className="canteen-food-image canteen-food-placeholder"><Utensils size={23}/></div>}
        <div className="canteen-food-card-body"><div className="canteen-card-tags"><span className={`canteen-diet-tag ${item.diet === 'Veg' ? 'diet-veg' : 'diet-nonveg'}`}><i/>{item.diet}</span><span className={item.available ? 'canteen-available-tag' : 'canteen-unavailable-tag'}>{item.available ? 'Available' : 'Unavailable'}</span></div>
          <h3>{item.name}{item.size && <small> · {item.size}</small>}</h3><span className="canteen-food-category">{item.category}</span>{item.description && <p>{item.description}</p>}
          <div className="canteen-food-card-footer"><strong>₹{item.price}</strong>{manager ? <button className="canteen-edit-button" onClick={() => editItem(item)}>Edit item</button> : <button className="module-primary" disabled={!item.available} onClick={() => addItem(item)}><Plus size={14}/> Add</button>}</div>
        </div>
      </article>)}</div>}
      {!manager && <section className="canteen-cart">
        <div className="canteen-section-heading"><div><span className="section-eyebrow">YOUR PRE-ORDER</span><h2>Cart <span>{cartLines.reduce((sum, line) => sum + line.quantity, 0)}</span></h2></div><strong className="canteen-cart-total">Total <b>₹{total}</b></strong></div>
        {!cartLines.length ? <p className="canteen-empty-cart">Your cart is empty. Add something delicious from the menu.</p> : <>
          <div className="canteen-cart-lines">{cartLines.map((line) => <div className="canteen-cart-line" key={line.id}><span><strong>{line.name}{line.size && ` · ${line.size}`}</strong><small>₹{line.price} each · ₹{line.price * line.quantity}</small></span><div className="canteen-quantity"><button aria-label={`Decrease ${line.name}`} onClick={() => changeQuantity(line.id, -1)}><Minus size={13}/></button><strong>{line.quantity}</strong><button aria-label={`Increase ${line.name}`} onClick={() => changeQuantity(line.id, 1)}><Plus size={13}/></button></div><button className="canteen-remove" aria-label={`Remove ${line.name}`} onClick={() => setCart((current) => { const next = { ...current }; delete next[line.id]; return next })}><X size={14}/></button></div>)}</div>
          <div className="canteen-order-summary"><strong>Order summary</strong>{cartLines.map((line) => <span key={line.id}>{line.name}{line.size && ` · ${line.size}`} × {line.quantity}<b>₹{line.price * line.quantity}</b></span>)}<span className="canteen-summary-total">Order total<b>₹{total}</b></span><button className="module-primary" disabled={busy === 'place-order'} onClick={placeOrder}>{busy === 'place-order' ? 'Placing order…' : 'Place Pre-Order'} <Check size={14}/></button></div>
        </>}
      </section>}
    </>}
    {tab === 'orders' && <section className="canteen-orders-section">
      <div className="canteen-section-heading"><div><span className="section-eyebrow">{manager ? 'LIVE QUEUE · COMPLETED · REJECTED' : 'ORDER TRACKING'}</span><h2>{manager ? 'Incoming orders & history' : 'My Orders'}</h2></div>{manager && <select aria-label="Filter order status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All orders</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>}</div>
      {visibleOrders.length === 0 ? <div className="management-state">{manager ? 'There are no orders in this view.' : 'Your pre-orders will appear here.'}</div> : <div className="canteen-order-list">{visibleOrders.map((order) => <article className="canteen-order-card" key={order.id}>
        <div className="canteen-order-heading"><div><span className="section-eyebrow">{manager ? `${order.customerName || order.studentName} · ${order.customerUserId || order.studentId}` : new Date(order.createdAt).toLocaleString()}</span><h3>{order.orderNumber}</h3></div><span className={`canteen-order-status status-${order.status.toLowerCase()}`}>{order.status}</span></div>
        <div className="canteen-order-items">{order.items.map((line, index) => <span key={`${line.itemId}-${index}`}>{line.name}{line.size && ` · ${line.size}`} × {line.quantity}<b>₹{line.subtotal}</b></span>)}</div>
        <div className="canteen-order-meta"><span><Clock3 size={13}/>{new Date(order.createdAt).toLocaleString()}</span><strong>Total ₹{order.total}</strong></div>
        <div className="canteen-timeline">{STEPS.map((step, index) => <div className={`canteen-timeline-step ${order.history.some((entry) => entry.status === step) ? 'timeline-complete' : ''} ${order.status === step ? 'timeline-current' : ''}`} key={step}><i>{order.history.some((entry) => entry.status === step) ? <Check size={10}/> : index + 1}</i><span>{step === 'PENDING' ? 'Order placed' : step.charAt(0) + step.slice(1).toLowerCase()}</span></div>)}</div>
        {order.status === 'REJECTED' && <p className="canteen-rejected-note">This order was not accepted. Please check the menu and order again.</p>}
        {manager && <div className="canteen-order-actions">{nextActions(order.status).map((status) => <button key={status} className={status === 'REJECTED' ? 'canteen-reject-action' : 'module-primary'} disabled={busy === order.id} onClick={() => updateOrder(order, status)}>{status === 'ACCEPTED' ? 'Accept' : status === 'REJECTED' ? 'Reject' : status === 'PREPARING' ? 'Start Preparing' : status === 'READY' ? 'Mark Ready' : 'Mark Completed'}</button>)}</div>}
      </article>)}</div>}
    </section>}
    {editing && <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}><section className="feedback-modal canteen-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="canteen-edit-title">
      <div className="modal-top"><span className="modal-icon"><Utensils size={19}/></span><button className="icon-btn" onClick={() => setEditing(null)} aria-label="Close"><X size={18}/></button></div><span className="section-eyebrow">CANTEEN MENU</span><h2 id="canteen-edit-title">{editing.id ? 'Edit food item.' : 'Add food item.'}</h2>
      <form className="canteen-item-form" onSubmit={saveItem}>
        <label>FOOD NAME<input required maxLength={120} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })}/></label>
        <label>DIET<select value={editing.diet} onChange={(event) => setEditing({ ...editing, diet: event.target.value, category: CATEGORIES[event.target.value][0] })}><option>Veg</option><option>Non-Veg</option></select></label>
        <label>CATEGORY<select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>{CATEGORIES[editing.diet].map((value, index) => <option key={`${value}-${index}`}>{value}</option>)}</select></label>
        <label>SIZE<select value={editing.size} onChange={(event) => setEditing({ ...editing, size: event.target.value })}><option value="">Regular / not applicable</option><option>Half</option><option>Full</option></select></label>
        <label>PRICE (₹)<input type="number" min="1" max="100000" step="1" required value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })}/></label>
        <label>IMAGE URL · OPTIONAL<input type="url" placeholder="https://…" value={editing.imageUrl || ''} onChange={(event) => setEditing({ ...editing, imageUrl: event.target.value })}/></label>
        <label className="canteen-description-field">DESCRIPTION · OPTIONAL<textarea maxLength={500} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })}/></label>
        <label className="canteen-availability-field"><input type="checkbox" checked={editing.available} onChange={(event) => setEditing({ ...editing, available: event.target.checked })}/> Available for student orders</label>
        {error && <span className="login-form-error" role="alert">{error}</span>}<div className="approval-request-actions"><button type="button" className="modal-cancel" onClick={() => setEditing(null)}>CANCEL</button><button className="module-primary" disabled={busy === 'save-item'}>{busy === 'save-item' ? 'Saving…' : 'Save menu item'}</button></div>
      </form>
    </section></div>}
    <footer className="dashboard-footer"><span><span className="footer-status-dot"/>Menu and orders sync with the campus database</span><span>{user.role} · {user.id}</span></footer>
  </div>
}

function nextActions(status) {
  return ({ PENDING: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['PREPARING'], PREPARING: ['READY'], READY: ['COMPLETED'] })[status] || []
}
