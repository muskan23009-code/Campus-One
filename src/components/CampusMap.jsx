import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown, Building2, CarFront, DoorOpen, House, Landmark, MapPin, Moon,
  Pill, RotateCcw, Route as RouteIcon, School, Scale, Sun, Trophy, Utensils,
  Warehouse, ZoomIn, ZoomOut,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { campusGeographicalLocation, campusMapLocations, campusWalkways } from '../data/campusMapLocations.js'
import { findCampusRoute } from '../data/campusMapRouting.js'

const MAP_WIDTH = 1000
const MAP_HEIGHT = 650
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const locationById = new Map(campusMapLocations.map((location) => [location.id, location]))
const locationIcons = {
  building: Building2,
  law: Scale,
  pharma: Pill,
  hostel: House,
  canteen: Utensils,
  ground: Trophy,
  reception: DoorOpen,
  parking: CarFront,
  hanger: Warehouse,
  school: School,
}

function CampusSchematic({ selectedLocation, onSelect, route, startId, destinationId, theme }) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [view, setView] = useState({ zoom: MIN_ZOOM, panX: 0, panY: 0 })

  function startPan(event) {
    if (event.target.closest('[data-campus-location]')) return
    const bounds = svgRef.current.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: view.panX,
      panY: view.panY,
      scaleX: MAP_WIDTH / bounds.width / view.zoom,
      scaleY: MAP_HEIGHT / bounds.height / view.zoom,
    }
    svgRef.current.setPointerCapture(event.pointerId)
  }

  function movePan(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView((current) => ({
      ...current,
      panX: drag.panX + (event.clientX - drag.startX) * drag.scaleX,
      panY: drag.panY + (event.clientY - drag.startY) * drag.scaleY,
    }))
  }

  function finishPan(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (svgRef.current.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId)
  }

  function selectFromKeyboard(event, location) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(location)
  }

  function changeZoom(amount) {
    setView((current) => ({ ...current, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + amount)) }))
  }

  function resetView() {
    setView({ zoom: MIN_ZOOM, panX: 0, panY: 0 })
  }

  return (
    <>
      <div className="campus-map-toolbar">
        <p>Drag to pan. Select a labelled place to see its information.</p>
        <div className="campus-map-controls" aria-label="Schematic map controls">
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(0.25)} disabled={view.zoom >= MAX_ZOOM}><ZoomIn size={17} /></button>
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(-0.25)} disabled={view.zoom <= MIN_ZOOM}><ZoomOut size={17} /></button>
          <button type="button" aria-label="Reset map view" title="Reset map view" onClick={resetView}><RotateCcw size={15} /><span>Reset</span></button>
        </div>
      </div>
      <div className="campus-schematic-frame">
        <svg
          ref={svgRef}
          className={`campus-schematic campus-schematic-${theme}`}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="group"
          aria-label="Interactive schematic campus layout. All displayed indoor positions are approximate."
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
        >
          <g transform={`translate(${view.panX} ${view.panY}) translate(500 325) scale(${view.zoom}) translate(-500 -325)`}>
            <rect className="campus-map-base" width={MAP_WIDTH} height={MAP_HEIGHT} rx="22" />
            <rect className="campus-map-ground" x="540" y="425" width="270" height="150" rx="28" />
            {campusWalkways.map(({ from, to }) => {
              const start = locationById.get(from)
              const end = locationById.get(to)
              return <line key={`${from}-${to}`} className="campus-walkway" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
            })}
            {route?.slice(0, -1).map((id, index) => {
              const start = locationById.get(id)
              const end = locationById.get(route[index + 1])
              const midpointX = (start.x + end.x) / 2
              const midpointY = (start.y + end.y) / 2
              const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
              return (
                <g key={`${id}-${route[index + 1]}`}>
                  <line className="campus-route-segment" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                  <path className="campus-route-arrowhead" d="M -8 -7 L 8 0 L -8 7 z" transform={`translate(${midpointX} ${midpointY}) rotate(${angle})`} />
                </g>
              )
            })}
            <circle className="campus-map-courtyard" cx="500" cy="320" r="52" />
            <text className="campus-map-courtyard-label" x="500" y="324" textAnchor="middle">CAMPUS</text>
            {campusMapLocations.map((location) => {
              const isSelected = selectedLocation?.id === location.id
              const isStart = startId === location.id
              const isDestination = destinationId === location.id
              const Icon = locationIcons[location.icon] || Landmark
              return (
                <g
                  key={location.id}
                  className={`campus-map-marker${isSelected ? ' campus-map-marker-selected' : ''}${isStart ? ' campus-map-marker-start' : ''}${isDestination ? ' campus-map-marker-destination' : ''}`}
                  transform={`translate(${location.x} ${location.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${location.name}`}
                  aria-pressed={isSelected}
                  data-campus-location
                  onClick={() => onSelect(location)}
                  onKeyDown={(event) => selectFromKeyboard(event, location)}
                >
                  <rect x="-91" y="-25" width="182" height="50" rx="11" />
                  <foreignObject x="-82" y="-10" width="20" height="20" pointerEvents="none">
                    <Icon className="campus-map-marker-icon" size={18} />
                  </foreignObject>
                  <text className="campus-map-marker-label" x="-54" y="4">{location.name}</text>
                  {(isStart || isDestination) && <text className="campus-map-marker-badge" x="0" y="-32" textAnchor="middle">{isStart ? 'START' : 'DESTINATION'}</text>}
                </g>
              )
            })}
          </g>
        </svg>
        <span className="campus-map-schematic-stamp">SCHEMATIC · NOT TO SCALE</span>
      </div>
      <div className="campus-location-picker" aria-label="Select a campus location">
        {campusMapLocations.map((location) => {
          const Icon = locationIcons[location.icon] || MapPin
          return (
            <button
              type="button"
              key={location.id}
              className={selectedLocation?.id === location.id ? 'campus-location-option campus-location-option-selected' : 'campus-location-option'}
              aria-pressed={selectedLocation?.id === location.id}
              onClick={() => onSelect(location)}
            >
              <Icon size={15} />
              <span>{location.name}</span>
            </button>
          )
        })}
      </div>
      <p className="campus-map-accuracy-note">This schematic uses approximate visual positions, not surveyed or GPS-accurate indoor coordinates.</p>
    </>
  )
}

function FindMyWay({ startId, destinationId, onStartChange, onDestinationChange, route, routeError, onFindRoute, onClearRoute }) {
  const canFind = Boolean(startId && destinationId && startId !== destinationId)
  const routeLocations = route?.map((id) => locationById.get(id)) || []

  return (
    <aside className="campus-route-panel" aria-label="Find My Way">
      <div className="campus-route-panel-heading">
        <span className="campus-route-icon"><RouteIcon size={18} /></span>
        <div><span className="campus-map-eyebrow">CAMPUS NAVIGATION</span><h3>Find My Way</h3></div>
      </div>
      <label className="campus-route-field">
        <span>Starting Point</span>
        <select value={startId} onChange={(event) => onStartChange(event.target.value)}>
          <option value="">Select starting point</option>
          {campusMapLocations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <span className="campus-route-connector" aria-hidden="true"><ArrowDown size={15} /></span>
      <label className="campus-route-field">
        <span>Destination</span>
        <select value={destinationId} onChange={(event) => onDestinationChange(event.target.value)}>
          <option value="">Select destination</option>
          {campusMapLocations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      {startId && destinationId && startId === destinationId && <p className="campus-route-hint">Choose two different locations to find a route.</p>}
      <div className="campus-route-actions">
        <button type="button" className="campus-route-find" onClick={onFindRoute} disabled={!canFind}><RouteIcon size={15} />Find Route</button>
        <button type="button" className="campus-route-clear" onClick={onClearRoute} disabled={!route && !startId && !destinationId && !routeError}>Clear Route</button>
      </div>
      {routeError && <p className="campus-route-error" role="alert">{routeError}</p>}
      {route && routeLocations.length > 0 && (
        <section className="campus-route-directions" aria-live="polite">
          <div className="campus-route-result-heading">
            <span className="campus-map-eyebrow">WALKING DIRECTIONS</span>
            <strong>{routeLocations.length - 1} walkway {routeLocations.length === 2 ? 'connection' : 'connections'}</strong>
          </div>
          <ol>
            {routeLocations.map((location, index) => (
              <li key={location.id} className={index === 0 ? 'campus-route-step-start' : index === routeLocations.length - 1 ? 'campus-route-step-end' : ''}>
                <span className="campus-route-step-marker">{index === 0 ? <MapPin size={14} /> : index === routeLocations.length - 1 ? <Landmark size={14} /> : index}</span>
                <span><strong>{index === 0 ? `Start at ${location.name}` : index === routeLocations.length - 1 ? `Arrive at ${location.name}` : `Continue to ${location.name}`}</strong>{index > 0 && index < routeLocations.length - 1 && <small>Follow the schematic walkway connection.</small>}</span>
              </li>
            ))}
          </ol>
          <p>Walkway connections are approximate; distance and walking time are unavailable.</p>
        </section>
      )}
      {!route && !routeError && <p className="campus-route-note">Choose two locations to see directions along the configured schematic walkway network.</p>}
    </aside>
  )
}

function GeographicalMap({ theme }) {
  const mapElementRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [mapError, setMapError] = useState('')

  useEffect(() => {
    let active = true
    import('leaflet').then(({ default: L }) => {
      if (!active || !mapElementRef.current) return
      const { latitude, longitude } = campusGeographicalLocation
      const map = L.map(mapElementRef.current, { scrollWheelZoom: false }).setView([latitude, longitude], 16)
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)
      tiles.on('tileerror', () => {
        if (active) setMapError('OpenStreetMap tiles could not be loaded. Check your connection; campus details and directions are still available.')
      })
      L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: 'campus-geographical-marker',
          html: '<span></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(map).bindPopup('Puran Murti Vidyapeeth')
      mapInstanceRef.current = map
      map.whenReady(() => map.invalidateSize())
    }).catch(() => {
      if (active) setMapError('The geographical map could not be loaded. Check your connection and try again.')
    })

    return () => {
      active = false
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [])

  return (
    <>
      {mapError && <p className="campus-geographical-error" role="alert">{mapError}</p>}
      <div ref={mapElementRef} className={`campus-geographical-map campus-geographical-map-${theme}`} role="application" aria-label="Geographical map of Puran Murti Vidyapeeth" />
      <div className="campus-geographical-details">
        <div><strong>Puran Murti Vidyapeeth</strong><span>{campusGeographicalLocation.address}</span></div>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${campusGeographicalLocation.latitude}%2C${campusGeographicalLocation.longitude}`} target="_blank" rel="noreferrer">Get directions</a>
      </div>
      <p className="campus-map-source-note">
        Campus marker verified against the <a href={campusGeographicalLocation.sourceUrl} target="_blank" rel="noreferrer">Google Maps campus listing</a>; address confirmed by the <a href={campusGeographicalLocation.addressSourceUrl} target="_blank" rel="noreferrer">official campus contact page</a>. Building markers are not shown because verified indoor coordinates are unavailable.
      </p>
    </>
  )
}

export default function CampusMap({ preferences, onUpdatePreferences }) {
  const [mapType, setMapType] = useState('schematic')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [startId, setStartId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [route, setRoute] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [localTheme, setLocalTheme] = useState(preferences?.theme === 'dark' ? 'dark' : 'light')
  const theme = preferences ? (preferences.theme === 'dark' ? 'dark' : 'light') : localTheme

  function changeTheme(value) {
    setLocalTheme(value)
    if (preferences && onUpdatePreferences) onUpdatePreferences({ ...preferences, theme: value })
  }

  function changeEndpoint(setEndpoint, value) {
    setEndpoint(value)
    setRoute(null)
    setRouteError('')
  }

  function findRoute() {
    if (!startId || !destinationId || startId === destinationId) {
      setRoute(null)
      setRouteError('Select two different locations to find a route.')
      return
    }
    const result = findCampusRoute(startId, destinationId)
    setRoute(result)
    setRouteError(result ? '' : 'No walkway route is configured between those locations.')
  }

  function clearRoute() {
    setStartId('')
    setDestinationId('')
    setRoute(null)
    setRouteError('')
  }

  return (
    <section className={`campus-map-section campus-map-theme-${theme}`} aria-label="Campus map">
      <div className="campus-map-heading">
        <div>
          <span className="section-eyebrow">EXPLORE CAMPUS</span>
          <h2>Explore the layout</h2>
        </div>
        <div className="campus-map-heading-controls">
          <div className="campus-map-theme-selector" role="group" aria-label="Campus map theme">
            <button type="button" aria-pressed={theme === 'light'} className={theme === 'light' ? 'campus-map-theme-selected' : ''} onClick={() => changeTheme('light')}><Sun size={14} />Light Theme</button>
            <button type="button" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'campus-map-theme-selected' : ''} onClick={() => changeTheme('dark')}><Moon size={14} />Dark Theme</button>
          </div>
          <div className="campus-map-tabs" role="tablist" aria-label="Map type">
            <button type="button" id="schematic-tab" role="tab" aria-selected={mapType === 'schematic'} aria-controls="campus-map-content" onClick={() => setMapType('schematic')}>Schematic Map</button>
            <button type="button" id="geographical-tab" role="tab" aria-selected={mapType === 'geographical'} aria-controls="campus-map-content" onClick={() => setMapType('geographical')}>Geographical Map</button>
          </div>
        </div>
      </div>
      <div id="campus-map-content" role="tabpanel" aria-labelledby={`${mapType}-tab`}>
        {mapType === 'schematic'
          ? <div className="campus-map-workspace">
            <FindMyWay
              startId={startId}
              destinationId={destinationId}
              onStartChange={(value) => changeEndpoint(setStartId, value)}
              onDestinationChange={(value) => changeEndpoint(setDestinationId, value)}
              route={route}
              routeError={routeError}
              onFindRoute={findRoute}
              onClearRoute={clearRoute}
            />
            <div className="campus-map-content-main">
              <CampusSchematic selectedLocation={selectedLocation} onSelect={setSelectedLocation} route={route} startId={startId} destinationId={destinationId} theme={theme} />
            </div>
          </div>
          : <GeographicalMap theme={theme} />}
      </div>
      {mapType === 'schematic' && (
        <div className="campus-location-details" aria-live="polite">
          {selectedLocation
            ? <><span className="campus-location-detail-icon"><MapPin size={18} /></span><div><span className="section-eyebrow">SELECTED LOCATION</span><h3>{selectedLocation.name}</h3><p>Shown on the approximate campus schematic. Its indoor position has not been verified.</p></div></>
            : <p>Select any labelled place on the schematic to view its information.</p>}
        </div>
      )}
    </section>
  )
}
