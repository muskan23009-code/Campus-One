import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleAlert, Clock3, Minus, Plus, Search, Settings2, ShoppingBag, Utensils, UserRound, X } from 'lucide-react'
import { api } from '../api/client'

const STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED']
const STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']
const CATEGORIES = {
  Veg: ['Tea & Coffee', 'Sandwich', 'Paneer Momos', 'Burger', 'Shakes & Drinks', 'Patty & Samosa', 'Maggi', 'French Fries', 'Pizza', 'Chinese', 'Add On'],
  'Non-Veg': ['Chicken Burger', 'Sandwich', 'Chicken Momos', 'Eggs', 'Patty', 'Continental', 'Chinese', 'Add On'],
}
const CATEGORY_ICONS = {
  'Tea & Coffee': '🍵', Sandwich: '🥪', 'Paneer Momos': '🥟', 'Chicken Momos': '🥟',
  Burger: '🍔', 'Chicken Burger': '🍔', 'Shakes & Drinks': '🥤', 'Patty & Samosa': '🥟',
  Maggi: '🍜', 'French Fries': '🍟', Pizza: '🍕', Chinese: '🥢', 'Add On': '➕',
  Eggs: '🍳', Patty: '🥟', Continental: '🍗',
}

function menuDiet(value) {
  return String(value).toLowerCase().includes('non') ? 'Non-Veg' : 'Veg'
}

function menuCategory(item) {
  const category = item.category
  if (category === 'Drinks') return 'Shakes & Drinks'
  if (category === 'Momos') return menuDiet(item.diet) === 'Non-Veg' ? 'Chicken Momos' : 'Paneer Momos'
  if (category === 'Burger' && menuDiet(item.diet) === 'Non-Veg') return 'Chicken Burger'
  return category
}

function groupMenuItems(items) {
  const groups = new Map()
  const individual = []
  items.forEach((item) => {
    if (!['Half', 'Full'].includes(item.size)) {
      individual.push({ key: item.id, items: [item] })
      return
    }
    const key = `${item.diet}\u0000${item.category}\u0000${item.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })
  const portions = []
  groups.forEach((variants) => {
    const halves = variants.filter((item) => item.size === 'Half')
    const fulls = variants.filter((item) => item.size === 'Full')
    const pairedCount = Math.min(halves.length, fulls.length)
    for (let index = 0; index < pairedCount; index += 1) {
      portions.push({ key: `${halves[index].id}:${fulls[index].id}`, items: [halves[index], fulls[index]] })
    }
    for (const item of [...halves.slice(pairedCount), ...fulls.slice(pairedCount)]) {
      individual.push({ key: item.id, items: [item] })
    }
  })
  return [...portions, ...individual]
}

export default function Canteen({ user, onNotify, onLogout, onBack }) {
  const manager = user.role === 'Canteen Staff'
  const customer = ['Student', 'Staff', 'HOD', 'Sports Captain', 'Administration'].includes(user.role)
  const [items, setItems] = useState([])
  const [orders, setOrders] = useState([])
  const [notifications, setNotifications] = useState([])
  const [cart, setCart] = useState({})
  const [diet, setDiet] = useState('Veg')
  const [category, setCategory] = useState('All')
  const [selectedVariants, setSelectedVariants] = useState({})
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

  const menuItems = useMemo(() => items.map((item) => ({ ...item, diet: menuDiet(item.diet), category: menuCategory(item) })), [items])
  const searchActive = Boolean(search.trim())
  const shownDiets = searchActive ? ['Veg', 'Non-Veg'] : [diet]
  const baseCategories = searchActive ? [...CATEGORIES.Veg, ...CATEGORIES['Non-Veg'].filter((entry) => !CATEGORIES.Veg.includes(entry))] : CATEGORIES[diet]
  const relevantDiets = searchActive ? ['Veg', 'Non-Veg'] : [diet]
  const additionalCategories = [...new Set(menuItems.filter((item) => relevantDiets.includes(item.diet)).map((item) => item.category))]
    .filter((entry) => !baseCategories.includes(entry))
  const categories = [...baseCategories, ...additionalCategories]
  const visibleItems = useMemo(() => menuItems.filter((item) =>
    (searchActive || item.diet === diet)
    && (category === 'All' || item.category === category)
    && (!search || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(search.toLowerCase()))), [menuItems, diet, category, search, searchActive])
  const menuSections = shownDiets.map((menuDietName) => ({
    diet: menuDietName,
    categories: categories.filter((categoryName) => {
      return visibleItems.some((item) => item.diet === menuDietName && item.category === categoryName)
    }).map((categoryName) => ({
      name: categoryName,
      items: visibleItems.filter((item) => item.diet === menuDietName && item.category === categoryName),
    })),
  })).filter((section) => section.categories.length > 0)
  const cartLines = Object.values(cart)
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0)
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
    <div className="module-breadcrumb">{onBack && <button className="canteen-back-link" onClick={onBack}><ArrowLeft size={13}/>Food & Dine In</button>}CAMPUS <span>›</span> CANTEEN</div>
    <section className="module-hero canteen-hero">
      <div className="module-title-area"><span className="module-icon"><Utensils size={20}/></span><span className="module-eyebrow">PURAN MURTI VIDYAPEETH</span><h1>{manager ? 'Canteen dashboard' : 'Campus Canteen'}<span className="module-title-period">.</span></h1><p>{manager ? 'Review incoming orders and update each order through delivery.' : 'Fresh · Fast · Affordable · Your campus food court, ready when you are.'}</p></div>
      {user.role === 'Canteen Staff' && <div className="canteen-account-actions"><button className="canteen-profile-link" onClick={() => onNavigate?.('profile')}><UserRound size={14}/>My Profile</button><button className="canteen-profile-link" onClick={() => onNavigate?.('settings')}><Settings2 size={14}/>Settings</button><button className="canteen-signout" onClick={onLogout}>Sign out</button></div>}
    </section>
    {error && <div className="management-alert canteen-alert" role="alert"><CircleAlert size={15}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {user.role === 'Canteen Staff' && notifications.some((notification) => !notification.readAt) && <section className="canteen-notifications"><span className="section-eyebrow">ORDER UPDATES</span>{notifications.filter((notification) => !notification.readAt).slice(0, 4).map((notification) => <button key={notification.id} onClick={async () => { try { await api(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: 'PATCH', body: {} }); setNotifications((current) => current.map((entry) => entry.id === notification.id ? { ...entry, readAt: new Date().toISOString() } : entry)); if (notification.target === 'canteen') setTab('orders') } catch (reason) { setError(reason.message) } }}><strong>{notification.title}</strong><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()} · View</small></button>)}</section>}
    {!manager && <div className="canteen-tabs" role="tablist">
      <button className={tab === 'menu' ? 'canteen-tab-active' : ''} onClick={() => setTab('menu')}><Utensils size={14}/>Menu</button>
      <button className={tab === 'orders' ? 'canteen-tab-active' : ''} onClick={() => setTab('orders')}><ShoppingBag size={14}/>My Orders{orders.length > 0 && <span>{orders.length}</span>}</button>
    </div>}
    {!manager && tab === 'menu' && <>
      <section className="canteen-diet-panels" aria-label="Choose a menu">
        {['Veg', 'Non-Veg'].map((value) => <button key={value} className={`canteen-diet-panel ${value === 'Veg' ? 'canteen-veg-panel' : 'canteen-nonveg-panel'} ${diet === value ? 'canteen-diet-panel-active' : ''}`} aria-pressed={diet === value} onClick={() => { setDiet(value); setCategory('All') }}>
          <span className="canteen-diet-emblem" aria-hidden="true">{value === 'Veg' ? '●' : '◆'}</span>
          <span><strong>{value.toUpperCase()} MENU</strong><small>{value === 'Veg' ? 'Fresh vegetarian favourites' : 'Chicken & egg favourites'}</small></span>
          <span className="canteen-diet-arrow" aria-hidden="true">→</span>
        </button>)}
      </section>
      <div className="canteen-browse-layout">
      <div className="canteen-filters">
        <label className="module-search canteen-search"><Search size={15}/><input aria-label="Search food" placeholder="Search the full menu…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        <nav className="canteen-category-nav" aria-label="Filter by menu category">
          <button className={category === 'All' ? 'canteen-category-active' : ''} onClick={() => setCategory('All')}>All categories</button>
          {categories.map((value) => <button key={value} className={category === value ? 'canteen-category-active' : ''} onClick={() => setCategory(category === value ? 'All' : value)}><span aria-hidden="true">{CATEGORY_ICONS[value] || '•'}</span>{value}</button>)}
        </nav>
      </div>
      {!manager && <section className="canteen-cart" aria-label="Current order">
        <div className="canteen-section-heading"><div><span className="section-eyebrow">YOUR PRE-ORDER</span><h2>Your order <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></h2></div><strong className="canteen-cart-total">Order total <b>₹{total}</b></strong></div>
        {!cartLines.length ? <p className="canteen-empty-cart">Your order is empty. Add something delicious from the menu.</p> : <>
          <div className="canteen-cart-lines" aria-live="polite">{cartLines.map((line) => <div className="canteen-cart-line" key={line.id}><span><strong>{line.name}{line.size && ` · ${line.size}`}</strong><small>₹{line.price} each · ₹{line.price * line.quantity}</small></span><div className="canteen-quantity"><button aria-label={`Decrease ${line.name}${line.size ? ` · ${line.size}` : ''}`} onClick={() => changeQuantity(line.id, -1)}><Minus size={13}/></button><strong>{line.quantity}</strong><button aria-label={`Increase ${line.name}${line.size ? ` · ${line.size}` : ''}`} onClick={() => changeQuantity(line.id, 1)}><Plus size={13}/></button></div><button className="canteen-remove" aria-label={`Remove ${line.name}${line.size ? ` · ${line.size}` : ''}`} onClick={() => setCart((current) => { const next = { ...current }; delete next[line.id]; return next })}><X size={14}/></button></div>)}</div>
          <button className="module-primary canteen-place-order" disabled={busy === 'place-order'} onClick={placeOrder}>{busy === 'place-order' ? 'Placing order…' : 'Place Pre-Order'} <Check size={14}/></button>
        </>}
      </section>}
      {loading ? <div className="management-state canteen-menu-state"><span className="loading-spinner"/>Loading canteen menu…</div> : visibleItems.length === 0 ? <div className="management-state canteen-menu-state">No available items match your search.</div> : <div className="canteen-menu-sections">
        {searchActive && <p className="canteen-search-scope">Search results include both menus. Every item is marked Veg or Non-Veg.</p>}
        {menuSections.map((section) => <section className={`canteen-diet-section ${section.diet === 'Veg' ? 'canteen-veg-section' : 'canteen-nonveg-section'}`} key={section.diet}>
          {searchActive && <h2 className="canteen-diet-section-title"><span aria-hidden="true">{section.diet === 'Veg' ? '●' : '◆'}</span>{section.diet} Menu</h2>}
          {section.categories.map((entry) => <MenuCategorySection key={`${section.diet}-${entry.name}`} category={entry.name} items={entry.items} diet={section.diet} cart={cart} selectedVariants={selectedVariants} onSelectVariant={(key, id) => setSelectedVariants((current) => ({ ...current, [key]: id }))} onAdd={addItem} onChangeQuantity={changeQuantity}/>)}
        </section>)}
      </div>}
      </div>
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

function MenuCategorySection({ category, items, diet, cart, selectedVariants, onSelectVariant, onAdd, onChangeQuantity }) {
  const menuCards = groupMenuItems(items)
  return <section className={`canteen-category-section ${diet === 'Veg' ? 'canteen-veg-category' : 'canteen-nonveg-category'}`}>
    <header className="canteen-category-heading"><span className="canteen-category-illustration" aria-hidden="true">{CATEGORY_ICONS[category] || '•'}</span><div><h2>{category}</h2><span>{items.length} {items.length === 1 ? 'favourite' : 'favourites'}</span></div></header>
    <div className="canteen-food-grid">{menuCards.map((group) => {
      const selectedId = selectedVariants[group.key]
      const activeItem = group.items.find((item) => item.id === selectedId)
        || group.items.find((item) => item.size === 'Half')
        || group.items[0]
      const count = cart[activeItem.id]?.quantity || 0
      const hasPortionChoice = group.items.length > 1 && group.items.some((item) => item.size === 'Half') && group.items.some((item) => item.size === 'Full')
      return <article className={`canteen-food-card ${diet === 'Veg' ? 'food-card-veg' : 'food-card-nonveg'} ${!activeItem.available ? 'canteen-unavailable' : ''}`} key={group.key}>
        <div className="canteen-food-card-body">
          <div className="canteen-card-tags"><span className={`canteen-diet-tag ${diet === 'Veg' ? 'diet-veg' : 'diet-nonveg'}`}><i/>{diet}</span><span className={activeItem.available ? 'canteen-available-tag' : 'canteen-unavailable-tag'}>{activeItem.available ? 'Available' : 'Unavailable'}</span></div>
          <h3>{activeItem.name}</h3>
          {activeItem.description && <p>{activeItem.description}</p>}
          {hasPortionChoice ? <div className="canteen-portion-picker" role="group" aria-label={`Choose portion for ${activeItem.name}`}>
            <span>PORTION</span><div>{group.items.map((item) => <button type="button" key={item.id} aria-pressed={activeItem.id === item.id} className={activeItem.id === item.id ? 'portion-selected' : ''} onClick={() => onSelectVariant(group.key, item.id)}>{item.size} — ₹{item.price}</button>)}</div>
          </div> : activeItem.size && <span className="canteen-single-portion">{activeItem.size} portion</span>}
          <div className="canteen-food-card-footer"><strong>₹{activeItem.price}</strong>{count > 0 ? <div className="canteen-quantity"><button aria-label={`Decrease ${activeItem.name}${activeItem.size ? ` · ${activeItem.size}` : ''}`} onClick={() => onChangeQuantity(activeItem.id, -1)}><Minus size={14}/></button><strong>{count}</strong><button aria-label={`Increase ${activeItem.name}${activeItem.size ? ` · ${activeItem.size}` : ''}`} onClick={() => onChangeQuantity(activeItem.id, 1)}><Plus size={14}/></button></div> : <button className="module-primary canteen-add-button" disabled={!activeItem.available} onClick={() => onAdd(activeItem)}><Plus size={14}/> Add</button>}</div>
        </div>
      </article>
    })}</div>
  </section>
}

function nextActions(status) {
  return ({ PENDING: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['PREPARING'], PREPARING: ['READY'], READY: ['COMPLETED'] })[status] || []
}
