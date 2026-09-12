import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Modal, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, useWindowDimensions, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch, peekCachedResponse } from '../api/client';
import DateTimePicker from '@react-native-community/datetimepicker';
import { onAppDataRefresh } from '../services/dataRefresh';
import { useTheme } from '../context/ThemeContext';
const TAB_BAR_CONTENT_HEIGHT = 50;

export default function LifeOps({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [rides, setRides] = useState([]);
  const [foodOrders, setFoodOrders] = useState([]);
  const [movieModal, setMovieModal] = useState(false);
  const [movieStep, setMovieStep] = useState('input'); // 'input' | 'shows' | 'seats' | 'confirmed'
  const [movieCity, setMovieCity] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [selectedCinema, setSelectedCinema] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [bookingMovie, setBookingMovie] = useState(false);
  const [movieResult, setMovieResult] = useState(null);
  const [bookedTickets, setBookedTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cab modal — step: 'input' | 'options' | 'confirmed'
  const [cabModal, setCabModal] = useState(false);
  const [cabStep, setCabStep] = useState('input');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [cabEstimate, setCabEstimate] = useState(null);
  const [fetchingCab, setFetchingCab] = useState(false);
  const [cabError, setCabError] = useState(null);
  const [selectedCab, setSelectedCab] = useState(null);
  const [bookingCab, setBookingCab] = useState(false);
  const [cabResult, setCabResult] = useState(null);

  // Food modal — step: 'input' | 'restaurants' | 'cart' | 'confirmed'
  const [foodModal, setFoodModal] = useState(false);
  const [foodStep, setFoodStep] = useState('input');
  const [foodQuery, setFoodQuery] = useState('');
  const [fetchingFood, setFetchingFood] = useState(false);
  const [foodError, setFoodError] = useState(null);
  const [foodSuggestions, setFoodSuggestions] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [orderingFood, setOrderingFood] = useState(false);
  const [foodResult, setFoodResult] = useState(null);

  // Flight modal
  const [flightModal, setFlightModal] = useState(false);
  const [flightStep, setFlightStep] = useState('input');
  const [flightFrom, setFlightFrom] = useState('');
  const [flightTo, setFlightTo] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [flightClass, setFlightClass] = useState('Economy');
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [bookingFlight, setBookingFlight] = useState(false);
  const [flightResult, setFlightResult] = useState(null);
  const [bookedFlights, setBookedFlights] = useState([]);
  const [flightSearchResults, setFlightSearchResults] = useState([]);
  const [flightSearchLoading, setFlightSearchLoading] = useState(false);
  const [flightSearchError, setFlightSearchError] = useState(null);
  const [showFlightDatePicker, setShowFlightDatePicker] = useState(false);

  // Hotel modal
  const [hotelModal, setHotelModal] = useState(false);
  const [hotelStep, setHotelStep] = useState('input'); // 'input' | 'options' | 'room' | 'confirmed'
  const [hotelCity, setHotelCity] = useState('');
  const [hotelCheckin, setHotelCheckin] = useState('');
  const [hotelCheckout, setHotelCheckout] = useState('');
  const [showCheckinPicker, setShowCheckinPicker] = useState(false);
  const [showCheckoutPicker, setShowCheckoutPicker] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingHotel, setBookingHotel] = useState(false);
  const [hotelResult, setHotelResult] = useState(null);
  const [bookedHotels, setBookedHotels] = useState([]);
  const [hotelSearchResults, setHotelSearchResults] = useState([]);
  const [hotelSearchLoading, setHotelSearchLoading] = useState(false);
  const [hotelSearchError, setHotelSearchError] = useState(null);

  // Track Orders modal
  const [trackModal, setTrackModal] = useState(false);
  const [trackId, setTrackId] = useState('');
  const [tracking, setTracking] = useState(false);
  const [trackResult, setTrackResult] = useState(null);

  const hasRealDataRef = useRef(false);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [r, f] = await Promise.all([
        apiFetch('/api/lifeops/rides'),
        apiFetch('/api/lifeops/orders'),
      ]);
      hasRealDataRef.current = true;
      setRides(r.rides || []);
      setFoodOrders(f.orders || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  // Paint the last known rides/orders immediately from cache — otherwise
  // this screen shows a blank state on every single open even though nothing
  // changed since last time. loadData() below still runs right after and
  // silently replaces this with fresh data; the ref guard stops a slow cache
  // read from ever clobbering real data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, f] = await Promise.all([
        peekCachedResponse('/api/lifeops/rides').catch(() => null),
        peekCachedResponse('/api/lifeops/orders').catch(() => null),
      ]);
      if (!cancelled && !hasRealDataRef.current && (r || f)) {
        if (r) setRides(r.rides || []);
        if (f) setFoodOrders(f.orders || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => onAppDataRefresh(() => loadData(true)), []);

  const fetchCabEstimate = async () => {
    if (!pickup.trim() || !destination.trim()) return;
    setFetchingCab(true);
    setCabError(null);
    try {
      const res = await apiFetch(`/api/lifeops/cab/estimate?pickup=${encodeURIComponent(pickup.trim())}&destination=${encodeURIComponent(destination.trim())}`);
      if (!res.options || res.options.length === 0) throw new Error('No options returned');
      setCabEstimate(res);
      setSelectedCab(null);
      setCabStep('options');
    } catch (e) { setCabError(e?.message || 'Failed to fetch fares. Try again.'); }
    finally { setFetchingCab(false); }
  };

  const confirmCab = async () => {
    if (!selectedCab) return;
    setBookingCab(true);
    try {
      const res = await apiFetch('/api/lifeops/cab', {
        method: 'POST',
        body: { pickup: pickup.trim(), destination: destination.trim(), cab_type: selectedCab.type, fare: selectedCab.fare, driver: selectedCab.driver, rating: selectedCab.rating, carModel: selectedCab.carModel, etaMin: selectedCab.etaMin },
      });
      setCabResult(res);
      setCabStep('confirmed');
      loadData(true);
    } catch {}
    finally { setBookingCab(false); }
  };

  const fetchFoodSuggestions = async () => {
    setFetchingFood(true);
    setFoodError(null);
    try {
      const res = await apiFetch(`/api/lifeops/food/suggest?query=${encodeURIComponent(foodQuery.trim())}`);
      if (!res.suggestions || res.suggestions.length === 0) throw new Error('No suggestions returned');
      setFoodSuggestions(res.suggestions);
      setFoodStep('restaurants');
    } catch (e) { setFoodError(e?.message || 'Failed to fetch suggestions. Try again.'); }
    finally { setFetchingFood(false); }
  };

  const confirmFood = async () => {
    if (!selectedRestaurant) return;
    setOrderingFood(true);
    try {
      const res = await apiFetch('/api/lifeops/food', {
        method: 'POST',
        body: { restaurant: selectedRestaurant.restaurant, items: selectedRestaurant.items, platform: selectedRestaurant.platform, totalAmount: selectedRestaurant.totalAmount, deliveryTime: selectedRestaurant.deliveryTime },
      });
      setFoodResult(res);
      setFoodStep('confirmed');
      loadData(true); // refreshes food orders list
    } catch {}
    finally { setOrderingFood(false); }
  };

  const trackOrder = async () => {
    if (!trackId.trim()) return;
    setTracking(true);
    try {
      const res = await apiFetch(`/api/lifeops/track?id=${encodeURIComponent(trackId.trim())}`);
      setTrackResult(res);
    } catch { setTrackResult({ status: 'In Transit', location: 'Update unavailable' }); }
    finally { setTracking(false); }
  };

  const QUICK_ACTIONS = [
    { icon: 'truck', label: 'Book Cab', color: theme.accent, bg: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), onPress: () => { setCabResult(null); setCabStep('input'); setCabEstimate(null); setSelectedCab(null); setPickup(''); setDestination(''); setCabModal(true); } },
    { icon: 'shopping-bag', label: 'Order Food', color: theme.warning, bg: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), onPress: () => { setFoodResult(null); setFoodStep('input'); setFoodQuery(''); setFoodSuggestions([]); setSelectedRestaurant(null); setFoodModal(true); } },
    { icon: 'film', label: 'Book Movie', color: theme.accentAlt, bg: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), onPress: () => { setMovieResult(null); setMovieCity(''); setMovieTitle(''); setMovieModal(true); } },
    { icon: 'package', label: 'Deliveries', color: theme.info, bg: (theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD'), onPress: () => {} },
    { icon: 'send', label: 'Book Flight', color: theme.accentAlt, bg: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), onPress: () => { setFlightResult(null); setFlightStep('input'); setFlightFrom(''); setFlightTo(''); setFlightDate(''); setFlightClass('Economy'); setSelectedFlight(null); setSelectedSeat(null); setFlightModal(true); } },
    { icon: 'coffee', label: 'Book Hotel', color: theme.danger, bg: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), onPress: () => { setHotelResult(null); setHotelStep('input'); setHotelCity(''); setHotelCheckin(''); setHotelCheckout(''); setSelectedHotel(null); setSelectedRoom(null); setHotelSearchResults([]); setHotelSearchError(null); setHotelModal(true); } },
    { icon: 'map-pin', label: 'Track Orders', color: theme.warning, bg: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), onPress: () => { setTrackResult(null); setTrackModal(true); } },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={theme.accent} colors={[theme.accent]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Life Ops</Text>
            <Text style={styles.headerSubtitle}>Cabs, food & daily operations</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="zap" size={18} color={theme.warning} />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity key={a.label} style={[styles.quickCard, { backgroundColor: a.bg }]} onPress={a.onPress} activeOpacity={0.75}>
              <View style={[styles.quickIconWrap, { backgroundColor: a.color + '22' }]}>
                <Feather name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={[styles.quickLabel, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Rides */}
        <Text style={styles.sectionHeader}>RECENT RIDES</Text>
        <View style={styles.sectionCard}>
          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.listSkeleton} />)
          ) : rides.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="navigation" size={26} color={theme.disabled} />
              <Text style={styles.emptyText}>No rides yet. Book your first cab above.</Text>
            </View>
          ) : (
            rides.map((ride, i) => (
              <View key={ride.id || i} style={[styles.listRow, i !== rides.length - 1 && styles.listRowDivider]}>
                <View style={styles.rideIconWrap}>
                  <Feather name="navigation" size={16} color={theme.accent} />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{ride.pickup} → {ride.destination}</Text>
                  <Text style={styles.listSubtitle}>{ride.status} {ride.fare ? `· ₹${ride.fare}` : ''}</Text>
                </View>
                <View style={[styles.rideBadge, { backgroundColor: ride.status === 'completed' ? (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6') : (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7') }]}>
                  <Text style={[styles.rideBadgeText, { color: ride.status === 'completed' ? theme.accent : theme.warning }]}>
                    {ride.status || 'Pending'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Food Orders */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>RECENT FOOD ORDERS</Text>
        <View style={styles.sectionCard}>
          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.listSkeleton} />)
          ) : foodOrders.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="shopping-bag" size={26} color={theme.disabled} />
              <Text style={styles.emptyText}>No orders yet. Order food above.</Text>
            </View>
          ) : (
            foodOrders.map((order, i) => (
              <View key={order.id || i} style={[styles.listRow, i !== foodOrders.length - 1 && styles.listRowDivider]}>
                <View style={styles.foodIconWrap}>
                  <Feather name="shopping-bag" size={16} color={theme.warning} />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{order.restaurant}</Text>
                  <Text style={styles.listSubtitle}>
                    {Array.isArray(order.items) ? order.items.join(', ') : order.items}
                    {order.platform ? ` · ${order.platform}` : ''}
                  </Text>
                </View>
                {order.totalAmount ? (
                  <View style={[styles.rideBadge, { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7') }]}>
                    <Text style={[styles.rideBadgeText, { color: theme.warning }]}>₹{order.totalAmount}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Book Movies */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>BOOK MOVIES</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.movieBannerRow}
            activeOpacity={0.8}
            onPress={() => { setMovieResult(null); setMovieStep('input'); setMovieCity(''); setMovieTitle(''); setSelectedCinema(null); setSelectedShow(null); setSelectedSeats([]); setMovieModal(true); }}
          >
            <LinearGradient colors={[theme.accentAlt, '#4A2FCC']} style={styles.movieBannerIcon}>
              <Feather name="film" size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.movieBannerTitle}>Book Cinema Tickets</Text>
              <Text style={styles.movieBannerSub}>PVR · INOX · Cinepolis</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.accentAlt} />
          </TouchableOpacity>
          {bookedTickets.length === 0 ? (
            <View style={[styles.emptyWrap, { paddingVertical: 16 }]}>
              <Text style={styles.emptyText}>No bookings yet. Tap above to book.</Text>
            </View>
          ) : (
            bookedTickets.map((t, i) => (
              <View key={i} style={[styles.listRow, i !== bookedTickets.length - 1 && styles.listRowDivider]}>
                <View style={styles.movieIconWrap}>
                  <Feather name="film" size={15} color={theme.accentAlt} />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{t.movie}</Text>
                  <Text style={styles.listSubtitle}>{t.cinema} · {t.show} · {t.seats.join(', ')}</Text>
                </View>
                <View style={[styles.rideBadge, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]}>
                  <Text style={[styles.rideBadgeText, { color: theme.accentAlt }]}>₹{t.amount}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Book Flight */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>BOOK FLIGHT</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.movieBannerRow}
            activeOpacity={0.8}
            onPress={() => { setFlightResult(null); setFlightStep('input'); setFlightFrom(''); setFlightTo(''); setFlightDate(''); setFlightClass('Economy'); setSelectedFlight(null); setSelectedSeat(null); setFlightModal(true); }}
          >
            <LinearGradient colors={[theme.accentAlt, '#7C5CE8']} style={styles.movieBannerIcon}>
              <Feather name="send" size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.movieBannerTitle}>Book Flight Tickets</Text>
              <Text style={styles.movieBannerSub}>IndiGo · Air India · Vistara · SpiceJet</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.accentAlt} />
          </TouchableOpacity>
          {bookedFlights.length === 0 ? (
            <View style={[styles.emptyWrap, { paddingVertical: 16 }]}>
              <Text style={styles.emptyText}>No bookings yet. Tap above to book.</Text>
            </View>
          ) : (
            bookedFlights.map((f, i) => (
              <View key={i} style={[styles.listRow, i !== bookedFlights.length - 1 && styles.listRowDivider]}>
                <View style={[styles.movieIconWrap, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]}>
                  <Feather name="send" size={15} color={theme.accentAlt} />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{f.airline} {f.flight} · Seat {f.seat}</Text>
                  <Text style={styles.listSubtitle}>{f.from} → {f.to} · {f.depart} · {f.class}</Text>
                </View>
                <View style={[styles.rideBadge, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]}>
                  <Text style={[styles.rideBadgeText, { color: theme.accentAlt }]}>₹{f.price.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Book Hotel */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>BOOK HOTEL</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.movieBannerRow}
            activeOpacity={0.8}
            onPress={() => { setHotelResult(null); setHotelStep('input'); setHotelCity(''); setHotelCheckin(''); setHotelCheckout(''); setSelectedHotel(null); setSelectedRoom(null); setHotelSearchResults([]); setHotelSearchError(null); setHotelModal(true); }}
          >
            <LinearGradient colors={[theme.danger, '#C8405A']} style={styles.movieBannerIcon}>
              <Feather name="home" size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.movieBannerTitle}>Book Hotel Stay</Text>
              <Text style={styles.movieBannerSub}>MakeMyTrip · Goibibo · OYO</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.danger} />
          </TouchableOpacity>
          {bookedHotels.length === 0 ? (
            <View style={[styles.emptyWrap, { paddingVertical: 16 }]}>
              <Text style={styles.emptyText}>No bookings yet. Tap above to book.</Text>
            </View>
          ) : (
            bookedHotels.map((h, i) => (
              <View key={i} style={[styles.listRow, i !== bookedHotels.length - 1 && styles.listRowDivider]}>
                <View style={[styles.movieIconWrap, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED') }]}>
                  <Feather name="home" size={15} color={theme.danger} />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{h.hotel}</Text>
                  <Text style={styles.listSubtitle}>{h.room} · {h.city} · {h.checkin} → {h.checkout}</Text>
                </View>
                <View style={[styles.rideBadge, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED') }]}>
                  <Text style={[styles.rideBadgeText, { color: theme.danger }]}>₹{h.price.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Cab Modal */}
      <Modal visible={cabModal} transparent animationType="slide" onRequestClose={() => setCabModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setCabModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.accent, '#3CB37A']} style={styles.agentIconGrad}>
                <Feather name="navigation" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>
                  {cabStep === 'input' ? 'Book a Cab' : cabStep === 'options' ? 'Choose Ride' : 'Ride Confirmed'}
                </Text>
                <Text style={styles.agentSubtitle}>
                  {cabStep === 'options' && cabEstimate?.distanceText ? `${cabEstimate.distanceText} · ${cabEstimate.durationText}` : 'Ola · Rapido · Auto'}
                </Text>
              </View>
              {cabStep === 'options' && (
                <TouchableOpacity onPress={() => setCabStep('input')} style={styles.backChip}>
                  <Feather name="arrow-left" size={14} color={theme.accent} />
                </TouchableOpacity>
              )}
            </View>

            {cabStep === 'input' && (
              <>
                <View style={styles.routeInputBlock}>
                  <View style={styles.routeInputRow}>
                    <View style={styles.routeDotGreen} />
                    <TextInput style={styles.routeInput} placeholder="Pickup — current location or address" placeholderTextColor={theme.placeholder} value={pickup} onChangeText={setPickup} />
                  </View>
                  <View style={styles.routeInputDivider} />
                  <View style={styles.routeInputRow}>
                    <Feather name="map-pin" size={13} color={theme.danger} />
                    <TextInput style={styles.routeInput} placeholder="Destination — where to?" placeholderTextColor={theme.placeholder} value={destination} onChangeText={setDestination} />
                  </View>
                </View>
                <View style={styles.aiContextRow}>
                  <Feather name="zap" size={12} color={theme.accent} />
                  <Text style={styles.aiContextText}>AI fetches live fare estimates across Ola, Rapido & Auto</Text>
                </View>
                {cabError ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={theme.danger} />
                    <Text style={styles.errorText}>{cabError}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.actionBtn, (!pickup.trim() || !destination.trim()) && styles.actionBtnDisabled]}
                  onPress={fetchCabEstimate}
                  disabled={!pickup.trim() || !destination.trim() || fetchingCab}
                >
                  <LinearGradient colors={[theme.accent, '#3CB37A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{fetchingCab ? 'Fetching fares…' : 'See Fare Options'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {cabStep === 'options' && (
              <>
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {(cabEstimate?.options || []).map((opt) => (
                    <TouchableOpacity
                      key={opt.type}
                      style={[styles.cabOptionCard, selectedCab?.type === opt.type && styles.cabOptionCardSelected]}
                      onPress={() => setSelectedCab(opt)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cabOptionLeft}>
                        <Text style={styles.cabOptionLabel}>{opt.label}</Text>
                        <Text style={styles.cabOptionMeta}>{opt.platform} · {opt.carModel}</Text>
                        <Text style={styles.cabOptionDriver}>{opt.driver} ⭐ {opt.rating}</Text>
                      </View>
                      <View style={styles.cabOptionRight}>
                        <Text style={styles.cabOptionFare}>₹{opt.fare}</Text>
                        <Text style={styles.cabOptionEta}>{opt.etaMin} min</Text>
                      </View>
                      {selectedCab?.type === opt.type && (
                        <View style={styles.cabOptionCheck}>
                          <Feather name="check-circle" size={18} color={theme.accent} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: 12 }, !selectedCab && styles.actionBtnDisabled]}
                  onPress={confirmCab}
                  disabled={!selectedCab || bookingCab}
                >
                  <LinearGradient colors={[theme.accent, '#3CB37A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="navigation" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingCab ? 'Confirming…' : selectedCab ? `Confirm ${selectedCab.label} · ₹${selectedCab.fare}` : 'Select a ride'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {cabStep === 'confirmed' && cabResult && (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(52,199,123,0.22)', 'rgba(52,199,123,0.34)'] : [(theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), '#D4F5E5']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color={theme.accent} />
                </LinearGradient>
                <Text style={styles.resultTitle}>Ride Confirmed!</Text>
                <Text style={styles.resultSub}>{cabResult.driver} is on the way</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), marginTop: 12 }]}>
                  <Feather name="truck" size={13} color={theme.accent} />
                  <Text style={[styles.resultInfoChipText, { color: theme.accent }]}>{cabResult.carModel} · ₹{cabResult.fare} · {cabResult.etaMin} min</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="hash" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{cabResult.bookingId}</Text>
                </View>
                <TouchableOpacity style={styles.resultDoneBtn} onPress={() => setCabModal(false)}>
                  <Text style={styles.resultDoneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Flight Modal */}
      <Modal visible={flightModal} transparent animationType="slide" onRequestClose={() => setFlightModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setFlightModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.accentAlt, '#7C5CE8']} style={styles.agentIconGrad}>
                <Feather name="send" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>
                  {flightStep === 'input' ? 'Book Flight' : flightStep === 'flights' ? 'Choose Flight' : flightStep === 'seats' ? 'Pick Seat' : 'Booking Confirmed!'}
                </Text>
                <Text style={styles.agentSubtitle}>IndiGo · Air India · Vistara</Text>
              </View>
              {(flightStep === 'flights' || flightStep === 'seats') && (
                <TouchableOpacity onPress={() => setFlightStep(flightStep === 'seats' ? 'flights' : 'input')} style={[styles.backChip, { borderColor: theme.accentAlt }]}>
                  <Feather name="arrow-left" size={14} color={theme.accentAlt} />
                </TouchableOpacity>
              )}
            </View>

            {/* Step 1 — Input */}
            {flightStep === 'input' && (
              <>
                <View style={styles.routeInputBlock}>
                  <View style={styles.routeInputRow}>
                    <View style={[styles.routeDotGreen, { backgroundColor: theme.accentAlt }]} />
                    <TextInput style={styles.routeInput} placeholder="From — IATA code e.g. BLR" placeholderTextColor={theme.placeholder} value={flightFrom} onChangeText={t => setFlightFrom(t.toUpperCase())} autoCapitalize="characters" maxLength={3} />
                  </View>
                  <View style={styles.routeInputDivider} />
                  <View style={styles.routeInputRow}>
                    <Feather name="map-pin" size={13} color={theme.danger} />
                    <TextInput style={styles.routeInput} placeholder="To — IATA code e.g. BOM" placeholderTextColor={theme.placeholder} value={flightTo} onChangeText={t => setFlightTo(t.toUpperCase())} autoCapitalize="characters" maxLength={3} />
                  </View>
                </View>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity style={styles.modalInput} onPress={() => setShowFlightDatePicker(true)}>
                  <Text style={{ color: flightDate ? theme.text : theme.faint, fontSize: 14 }}>{flightDate || 'Select date'}</Text>
                </TouchableOpacity>
                {showFlightDatePicker && (
                  <DateTimePicker
                    value={flightDate ? new Date(flightDate) : new Date()}
                    mode="date"
                    minimumDate={new Date()}
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_, date) => {
                      setShowFlightDatePicker(false);
                      if (date) setFlightDate(date.toISOString().slice(0, 10));
                    }}
                  />
                )}
                <Text style={styles.inputLabel}>Class</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {['Economy', 'Business', 'First'].map(c => (
                    <TouchableOpacity key={c} onPress={() => setFlightClass(c)}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                        backgroundColor: flightClass === c ? theme.accentAlt : theme.surfaceAlt,
                        borderWidth: 1.5, borderColor: flightClass === c ? theme.accentAlt : 'transparent' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: flightClass === c ? '#FFFFFF' : theme.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {flightSearchError ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={theme.danger} />
                    <Text style={styles.errorText}>{flightSearchError}</Text>
                  </View>
                ) : null}
                <View style={[styles.aiContextRow, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]}>
                  <Feather name="zap" size={12} color={theme.accentAlt} />
                  <Text style={[styles.aiContextText, { color: theme.accentAlt }]}>Live flight prices via Skyscanner — real availability</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, (!flightFrom.trim() || !flightTo.trim() || !flightDate) && styles.actionBtnDisabled]}
                  disabled={!flightFrom.trim() || !flightTo.trim() || !flightDate || flightSearchLoading}
                  onPress={async () => {
                    setFlightSearchLoading(true);
                    setFlightSearchError(null);
                    try {
                      const res = await apiFetch(`/api/lifeops/flight/search?from=${flightFrom.trim()}&to=${flightTo.trim()}&date=${flightDate}`);
                      if (!res.flights || res.flights.length === 0) throw new Error('No flights found for this route and date');
                      setFlightSearchResults(res.flights);
                      setFlightStep('flights');
                    } catch (e) {
                      setFlightSearchError(e?.message || 'Search failed. Try again.');
                    } finally {
                      setFlightSearchLoading(false);
                    }
                  }}
                >
                  <LinearGradient colors={[theme.accentAlt, '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{flightSearchLoading ? 'Searching live flights…' : 'Search Flights'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 2 — Real flight results */}
            {flightStep === 'flights' && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 12 }]}>{flightFrom} → {flightTo} · {flightDate} · {flightClass}</Text>
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {flightSearchResults.map((f) => (
                    <TouchableOpacity key={f.id}
                      style={[styles.cabOptionCard, selectedFlight?.id === f.id && styles.cabOptionCardSelected,
                        { borderColor: selectedFlight?.id === f.id ? theme.accentAlt : 'transparent',
                          backgroundColor: selectedFlight?.id === f.id ? (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') : theme.surfaceAlt }]}
                      onPress={() => { setSelectedFlight(f); setSelectedSeat(null); setFlightStep('seats'); }}
                      activeOpacity={0.8}>
                      <View style={styles.cabOptionLeft}>
                        <Text style={styles.cabOptionLabel}>{f.airline}</Text>
                        <Text style={styles.cabOptionMeta}>{f.flightCode} · {f.depart} → {f.arrive}</Text>
                        <Text style={styles.cabOptionDriver}>{f.duration} · {f.stops === 0 ? 'Non-stop' : f.stops + ' stop'}</Text>
                      </View>
                      <View style={styles.cabOptionRight}>
                        <Text style={[styles.cabOptionFare, { color: theme.accentAlt }]}>{f.priceFormatted}</Text>
                        <Text style={styles.cabOptionEta}>{flightClass}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Step 3 — Seat picker */}
            {flightStep === 'seats' && selectedFlight && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 4 }]}>{selectedFlight.airline} {selectedFlight.flightCode} · {selectedFlight.depart} → {selectedFlight.arrive}</Text>
                <Text style={[styles.listSubtitle, { marginBottom: 14 }]}>Tap a seat to select</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['1A','1B','1C','2A','2B','2C','3A','3B','3C','4A','4B','4C'].map(seat => {
                    const taken = ['1B','2A','3C','4B'].includes(seat);
                    const picked = selectedSeat === seat;
                    return (
                      <TouchableOpacity key={seat} disabled={taken}
                        onPress={() => setSelectedSeat(seat)}
                        style={{ width: 52, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: taken ? theme.border : picked ? theme.accentAlt : (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'),
                          borderWidth: 1.5, borderColor: taken ? theme.borderStrong : picked ? theme.accentAlt : (theme.isDark ? 'rgba(129,128,255,0.4)' : '#C4B5FD') }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: taken ? theme.disabled : picked ? '#FFFFFF' : theme.accentAlt }}>{seat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.cartTotalRow, { marginBottom: 14 }]}>
                  <Text style={styles.cartTotalLabel}>Total</Text>
                  <Text style={styles.cartTotalAmount}>{selectedFlight.priceFormatted}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, !selectedSeat && styles.actionBtnDisabled]}
                  disabled={!selectedSeat || bookingFlight}
                  onPress={async () => {
                    setBookingFlight(true);
                    try {
                      const res = await apiFetch('/api/lifeops/flight/book', {
                        method: 'POST',
                        body: {
                          flightId: selectedFlight.id, airline: selectedFlight.airline,
                          flightCode: selectedFlight.flightCode,
                          from: flightFrom, to: flightTo,
                          depart: selectedFlight.depart, arrive: selectedFlight.arrive,
                          date: flightDate, cabinClass: flightClass,
                          seat: selectedSeat, price: selectedFlight.price,
                        },
                      });
                      setFlightResult(res);
                      setBookedFlights(prev => [res, ...prev]);
                      setFlightStep('confirmed');
                    } catch (e) {
                      setFlightSearchError(e?.message || 'Booking failed');
                    } finally {
                      setBookingFlight(false);
                    }
                  }}
                >
                  <LinearGradient colors={[theme.accentAlt, '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="credit-card" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingFlight ? 'Booking…' : `Confirm — ${selectedFlight.priceFormatted}`}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 4 — Confirmed */}
            {flightStep === 'confirmed' && flightResult && (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(129,128,255,0.22)', 'rgba(129,128,255,0.34)'] : [(theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), '#E9E0FF']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color={theme.accentAlt} />
                </LinearGradient>
                <Text style={styles.resultTitle}>Flight Booked!</Text>
                <Text style={styles.resultSub}>Have a great flight ✈️</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), marginTop: 12 }]}>
                  <Feather name="send" size={13} color={theme.accentAlt} />
                  <Text style={[styles.resultInfoChipText, { color: theme.accentAlt }]}>{flightResult.airline} {flightResult.flightCode} · {flightResult.depart} → {flightResult.arrive}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="map-pin" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{flightResult.from} → {flightResult.to} · {flightResult.date}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="tag" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>Seat {flightResult.seat} · {flightResult.cabinClass} · ₹{Number(flightResult.price).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="hash" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{flightResult.bookingId}</Text>
                </View>
                <Text style={styles.resultSub}>Complete payment on Skyscanner ✈️</Text>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: 8 }]}
                  onPress={() => Linking.openURL(flightResult.deepLink)}
                >
                  <LinearGradient colors={[theme.accentAlt, '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="external-link" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Complete on Skyscanner</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]} onPress={() => setFlightModal(false)}>
                  <Text style={[styles.resultDoneBtnText, { color: theme.accentAlt }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hotel Modal */}
      <Modal visible={hotelModal} transparent animationType="slide" onRequestClose={() => setHotelModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setHotelModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.danger, '#C8405A']} style={styles.agentIconGrad}>
                <Feather name="home" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>
                  {hotelStep === 'input' ? 'Book Hotel' : hotelStep === 'options' ? 'Choose Hotel' : hotelStep === 'room' ? 'Pick Room' : 'Booking Confirmed!'}
                </Text>
                <Text style={styles.agentSubtitle}>MakeMyTrip · Goibibo · OYO</Text>
              </View>
              {(hotelStep === 'options' || hotelStep === 'room') && (
                <TouchableOpacity onPress={() => setHotelStep(hotelStep === 'room' ? 'options' : 'input')} style={[styles.backChip, { borderColor: theme.danger }]}>
                  <Feather name="arrow-left" size={14} color={theme.danger} />
                </TouchableOpacity>
              )}
            </View>

            {/* Step 1 — Input */}
            {/* Step 1 — Input */}
            {hotelStep === 'input' && (
              <>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. Goa, Delhi, Mumbai" placeholderTextColor={theme.placeholder} value={hotelCity} onChangeText={setHotelCity} />
                <View style={styles.dateRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.inputLabel}>Check-in</Text>
                    <TouchableOpacity style={styles.modalInput} onPress={() => setShowCheckinPicker(true)}>
                      <Text style={{ color: hotelCheckin ? theme.text : theme.faint, fontSize: 14 }}>
                        {hotelCheckin || 'Select date'}
                      </Text>
                    </TouchableOpacity>
                    {showCheckinPicker && (
                      <DateTimePicker
                        value={hotelCheckin ? new Date(hotelCheckin) : new Date()}
                        mode="date"
                        minimumDate={new Date()}
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        onChange={(_, date) => {
                          setShowCheckinPicker(false);
                          if (date) setHotelCheckin(date.toISOString().slice(0, 10));
                        }}
                      />
                    )}
                  </View>
                  <View style={styles.dateCol}>
                    <Text style={styles.inputLabel}>Check-out</Text>
                    <TouchableOpacity style={styles.modalInput} onPress={() => setShowCheckoutPicker(true)}>
                      <Text style={{ color: hotelCheckout ? theme.text : theme.faint, fontSize: 14 }}>
                        {hotelCheckout || 'Select date'}
                      </Text>
                    </TouchableOpacity>
                    {showCheckoutPicker && (
                      <DateTimePicker
                        value={hotelCheckout ? new Date(hotelCheckout) : new Date()}
                        mode="date"
                        minimumDate={hotelCheckin ? new Date(new Date(hotelCheckin).getTime() + 86400000) : new Date()}
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        onChange={(_, date) => {
                          setShowCheckoutPicker(false);
                          if (date) setHotelCheckout(date.toISOString().slice(0, 10));
                        }}
                      />
                    )}
                  </View>
                </View>
                {hotelSearchError ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={theme.danger} />
                    <Text style={styles.errorText}>{hotelSearchError}</Text>
                  </View>
                ) : null}
                <View style={[styles.aiContextRow, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED') }]}>
                  <Feather name="zap" size={12} color={theme.danger} />
                  <Text style={[styles.aiContextText, { color: theme.danger }]}>Live hotel inventory via Booking.com — real prices, real availability</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, (!hotelCity.trim() || !hotelCheckin.trim() || !hotelCheckout.trim()) && styles.actionBtnDisabled]}
                  disabled={!hotelCity.trim() || !hotelCheckin.trim() || !hotelCheckout.trim() || hotelSearchLoading}
                  onPress={async () => {
                    setHotelSearchLoading(true);
                    setHotelSearchError(null);
                    try {
                      const res = await apiFetch(`/api/lifeops/hotel/search?city=${encodeURIComponent(hotelCity.trim())}&checkIn=${hotelCheckin.trim()}&checkOut=${hotelCheckout.trim()}`);
                      if (!res.hotels || res.hotels.length === 0) throw new Error('No hotels found for this city and dates');
                      setHotelSearchResults(res.hotels);
                      setHotelStep('options');
                    } catch (e) {
                      setHotelSearchError(e?.message || 'Search failed. Try again.');
                    } finally {
                      setHotelSearchLoading(false);
                    }
                  }}
                >
                  <LinearGradient colors={[theme.danger, '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{hotelSearchLoading ? 'Searching live inventory…' : 'Search Hotels'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 2 — Real hotel results from Booking.com */}
            {hotelStep === 'options' && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 12 }]}>{hotelSearchResults.length} hotels in {hotelCity}</Text>
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {hotelSearchResults.map((h, i) => (
                    <TouchableOpacity key={h.offerId || i}
                      style={[styles.cabOptionCard, selectedHotel?.offerId === h.offerId && styles.cabOptionCardSelected,
                        { borderColor: selectedHotel?.offerId === h.offerId ? theme.danger : 'transparent',
                          backgroundColor: selectedHotel?.offerId === h.offerId ? (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED') : theme.surfaceAlt }]}
                      onPress={() => { setSelectedHotel(h); setHotelStep('room'); }}
                      activeOpacity={0.8}>
                      <View style={styles.cabOptionLeft}>
                        <Text style={styles.cabOptionLabel} numberOfLines={1}>{h.name}</Text>
                        <Text style={styles.cabOptionMeta}>{h.rating ? '⭐'.repeat(Math.min(parseInt(h.rating), 5)) + ' · ' : ''}{h.roomType}</Text>
                        <Text style={styles.cabOptionDriver}>{h.checkIn} → {h.checkOut}</Text>
                      </View>
                      <View style={styles.cabOptionRight}>
                        <Text style={[styles.cabOptionFare, { color: theme.danger }]}>₹{Math.round(h.price).toLocaleString('en-IN')}</Text>
                        <Text style={styles.cabOptionEta}>total</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Step 3 — Room confirmation (Booking.com offer) */}
            {hotelStep === 'room' && selectedHotel && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 4 }]}>{selectedHotel.name}</Text>
                <Text style={[styles.listSubtitle, { marginBottom: 14 }]}>Confirm your room</Text>
                <View style={[styles.cabOptionCard, { borderColor: theme.danger, backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), borderWidth: 2 }]}>
                  <View style={styles.cabOptionLeft}>
                    <Text style={styles.cabOptionLabel}>{selectedHotel.roomType}</Text>
                    <Text style={styles.cabOptionMeta}>{selectedHotel.beds || 'Standard configuration'}</Text>
                    <Text style={styles.cabOptionDriver}>{selectedHotel.boardType || 'Room only'} · {selectedHotel.checkIn} → {selectedHotel.checkOut}</Text>
                  </View>
                  <View style={styles.cabOptionRight}>
                    <Text style={[styles.cabOptionFare, { color: theme.danger }]}>₹{Math.round(selectedHotel.price).toLocaleString('en-IN')}</Text>
                    <Text style={styles.cabOptionEta}>total</Text>
                  </View>
                </View>
                <View style={[styles.aiContextRow, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), marginTop: 12 }]}>
                  <Feather name="shield" size={12} color={theme.danger} />
                  <Text style={[styles.aiContextText, { color: theme.danger }]}>Real inventory via Booking.com. Payment is completed on their platform after confirmation.</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: 12 }]}
                  disabled={bookingHotel}
                  onPress={async () => {
                    setBookingHotel(true);
                    try {
                      const res = await apiFetch('/api/lifeops/hotel/book', {
                        method: 'POST',
                        body: {
                          offerId:   selectedHotel.offerId,
                          hotelName: selectedHotel.name,
                          roomType:  selectedHotel.roomType,
                          price:     selectedHotel.price,
                          checkIn:   selectedHotel.checkIn,
                          checkOut:  selectedHotel.checkOut,
                          city:      hotelCity,
                        },
                      });
                      const booking = {
                        hotel:     selectedHotel.name,
                        city:      hotelCity,
                        checkin:   selectedHotel.checkIn,
                        checkout:  selectedHotel.checkOut,
                        room:      selectedHotel.roomType,
                        price:     Math.round(selectedHotel.price),
                        bookingId: res.bookingId,
                        providerRef: res.providerRef,
                        deepLink:  res.deepLink,
                      };
                      setHotelResult(booking);
                      setBookedHotels(prev => [booking, ...prev]);
                      setHotelStep('confirmed');
                    } catch (e) {
                      setHotelSearchError(e?.message || 'Booking failed. Try again.');
                      setHotelStep('input');
                    } finally {
                      setBookingHotel(false);
                    }
                  }}
                >
                  <LinearGradient colors={[theme.danger, '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="credit-card" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingHotel ? 'Reserving…' : `Confirm · ₹${Math.round(selectedHotel.price).toLocaleString('en-IN')}`}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 4 — Confirmed */}
            {hotelStep === 'confirmed' && hotelResult && (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(241,113,134,0.22)', 'rgba(241,113,134,0.34)'] : [(theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), '#FAD4DB']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color={theme.danger} />
                </LinearGradient>
                <Text style={styles.resultTitle}>Hotel Reserved!</Text>
                <Text style={styles.resultSub}>Complete payment on Booking.com 🏨</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), marginTop: 12 }]}>
                  <Feather name="home" size={13} color={theme.danger} />
                  <Text style={[styles.resultInfoChipText, { color: theme.danger }]}>{hotelResult.hotel} · {hotelResult.room}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="map-pin" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{hotelResult.city}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="calendar" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{hotelResult.checkin} → {hotelResult.checkout} · ₹{hotelResult.price.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="hash" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{hotelResult.bookingId}</Text>
                </View>
                {hotelResult.deepLink && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { marginTop: 16, width: '100%' }]}
                    onPress={() => Linking.openURL(hotelResult.deepLink)}
                  >
                    <LinearGradient colors={[theme.danger, '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                      <Feather name="external-link" size={15} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>Complete on Booking.com</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED') }]} onPress={() => setHotelModal(false)}>
                  <Text style={[styles.resultDoneBtnText, { color: theme.danger }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Track Orders Modal */}
      <Modal visible={trackModal} transparent animationType="slide" onRequestClose={() => setTrackModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setTrackModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.info, '#2E86C8']} style={styles.agentIconGrad}>
                <Feather name="map-pin" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Track Order</Text>
                <Text style={styles.agentSubtitle}>Amazon · Flipkart · Meesho</Text>
              </View>
              <View style={[styles.agentPill, { backgroundColor: (theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD') }]}>
                <View style={[styles.agentPillDot, { backgroundColor: theme.info }]} />
                <Text style={[styles.agentPillText, { color: theme.info }]}>AI Ready</Text>
              </View>
            </View>
            {trackResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(107,184,240,0.22)', 'rgba(107,184,240,0.34)'] : [(theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD'), '#C8E4F8']} style={styles.resultIconWrap}>
                  <Feather name="package" size={28} color={theme.info} />
                </LinearGradient>
                <Text style={styles.resultTitle}>{trackResult.status || 'In Transit'}</Text>
                <Text style={styles.resultSub}>Your AI twin fetched the latest update</Text>
                {trackResult.location ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD'), marginTop: 12 }]}>
                    <Feather name="map-pin" size={13} color={theme.info} />
                    <Text style={[styles.resultInfoChipText, { color: theme.info }]}>{trackResult.location}</Text>
                  </View>
                ) : null}
                {trackResult.eta ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                    <Feather name="clock" size={13} color={theme.muted} />
                    <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>ETA: {trackResult.eta}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: (theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD') }]} onPress={() => { setTrackModal(false); setTrackId(''); setTrackResult(null); }}>
                  <Text style={[styles.resultDoneBtnText, { color: theme.info }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>Order ID / AWB Number</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 408-1234567-8901234"
                  placeholderTextColor={theme.placeholder}
                  value={trackId}
                  onChangeText={setTrackId}
                  autoCapitalize="characters"
                />
                <View style={[styles.aiContextRow, { backgroundColor: (theme.isDark ? 'rgba(107,184,240,0.16)' : '#EAF3FD') }]}>
                  <Feather name="zap" size={12} color={theme.info} />
                  <Text style={[styles.aiContextText, { color: theme.info }]}>AI will pull real-time status from Amazon, Flipkart, Delhivery & more</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, !trackId.trim() && styles.actionBtnDisabled]}
                  onPress={trackOrder}
                  disabled={!trackId.trim() || tracking}
                >
                  <LinearGradient colors={[theme.info, '#2E86C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="map-pin" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{tracking ? 'Fetching status…' : 'Track via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Movie Booking Modal */}
      <Modal visible={movieModal} transparent animationType="slide" onRequestClose={() => setMovieModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setMovieModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.accentAlt, '#4A2FCC']} style={styles.agentIconGrad}>
                <Feather name="film" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>
                  {movieStep === 'input' ? 'Book Movie Tickets' : movieStep === 'shows' ? 'Choose Showtime' : movieStep === 'seats' ? 'Pick Seats' : 'Booking Confirmed!'}
                </Text>
                <Text style={styles.agentSubtitle}>PVR · INOX · Cinepolis</Text>
              </View>
              {(movieStep === 'shows' || movieStep === 'seats') && (
                <TouchableOpacity onPress={() => setMovieStep(movieStep === 'seats' ? 'shows' : 'input')} style={[styles.backChip, { borderColor: theme.accentAlt }]}>
                  <Feather name="arrow-left" size={14} color={theme.accentAlt} />
                </TouchableOpacity>
              )}
            </View>

            {/* Step 1 — Input */}
            {movieStep === 'input' && (
              <>
                <Text style={styles.inputLabel}>Movie Name</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. Pushpa 2, Kalki 2898 AD" placeholderTextColor={theme.placeholder} value={movieTitle} onChangeText={setMovieTitle} />
                <Text style={styles.inputLabel}>City</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. Bengaluru, Mumbai, Delhi" placeholderTextColor={theme.placeholder} value={movieCity} onChangeText={setMovieCity} />
                <Text style={styles.inputLabel}>Cinema</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {['PVR', 'INOX', 'Cinepolis'].map(c => (
                    <TouchableOpacity key={c} onPress={() => setSelectedCinema(c)}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                        backgroundColor: selectedCinema === c ? theme.accentAlt : theme.surfaceAlt,
                        borderWidth: 1.5, borderColor: selectedCinema === c ? theme.accentAlt : 'transparent' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: selectedCinema === c ? '#FFFFFF' : theme.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, (!movieTitle.trim() || !movieCity.trim() || !selectedCinema) && styles.actionBtnDisabled]}
                  disabled={!movieTitle.trim() || !movieCity.trim() || !selectedCinema}
                  onPress={() => setMovieStep('shows')}
                >
                  <LinearGradient colors={[theme.accentAlt, '#4A2FCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Find Shows</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 2 — Showtimes */}
            {movieStep === 'shows' && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 12 }]}>{movieTitle} · {selectedCinema}, {movieCity}</Text>
                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                  {[
                    { time: '10:30 AM', format: 'IMAX 3D', price: 450, seats: 42 },
                    { time: '1:45 PM',  format: '4DX',     price: 520, seats: 18 },
                    { time: '4:00 PM',  format: '2D',      price: 280, seats: 67 },
                    { time: '7:15 PM',  format: '3D',      price: 350, seats: 31 },
                    { time: '10:30 PM', format: '2D',      price: 260, seats: 55 },
                  ].map((show) => (
                    <TouchableOpacity key={show.time}
                      style={[styles.cabOptionCard, selectedShow?.time === show.time && styles.cabOptionCardSelected, { borderColor: selectedShow?.time === show.time ? theme.accentAlt : 'transparent', backgroundColor: selectedShow?.time === show.time ? (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') : theme.surfaceAlt }]}
                      onPress={() => { setSelectedShow(show); setMovieStep('seats'); }}
                      activeOpacity={0.8}>
                      <View style={styles.cabOptionLeft}>
                        <Text style={styles.cabOptionLabel}>{show.time}</Text>
                        <Text style={styles.cabOptionMeta}>{show.format} · {show.seats} seats left</Text>
                      </View>
                      <Text style={[styles.cabOptionFare, { color: theme.accentAlt }]}>₹{show.price}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Step 3 — Seat picker */}
            {movieStep === 'seats' && selectedShow && (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 4 }]}>{selectedShow.time} · {selectedShow.format}</Text>
                <Text style={[styles.listSubtitle, { marginBottom: 14 }]}>Tap seats to select (max 4)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4'].map(seat => {
                    const taken = ['A2','B3','C1'].includes(seat);
                    const picked = selectedSeats.includes(seat);
                    return (
                      <TouchableOpacity key={seat} disabled={taken}
                        onPress={() => setSelectedSeats(s => picked ? s.filter(x => x !== seat) : s.length < 4 ? [...s, seat] : s)}
                        style={{ width: 48, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: taken ? theme.border : picked ? theme.accentAlt : (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'),
                          borderWidth: 1.5, borderColor: taken ? theme.borderStrong : picked ? theme.accentAlt : (theme.isDark ? 'rgba(129,128,255,0.4)' : '#A78BFA') }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: taken ? theme.disabled : picked ? '#FFFFFF' : theme.accentAlt }}>{seat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.cartTotalRow, { marginBottom: 14 }]}>
                  <Text style={styles.cartTotalLabel}>Total ({selectedSeats.length} seats)</Text>
                  <Text style={styles.cartTotalAmount}>₹{selectedSeats.length * selectedShow.price}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, selectedSeats.length === 0 && styles.actionBtnDisabled]}
                  disabled={selectedSeats.length === 0 || bookingMovie}
                  onPress={async () => {
                    setBookingMovie(true);
                    await new Promise(r => setTimeout(r, 900));
                    const ticket = { movie: movieTitle, cinema: `${selectedCinema}, ${movieCity}`, show: `${selectedShow.time} ${selectedShow.format}`, seats: selectedSeats, amount: selectedSeats.length * selectedShow.price, bookingId: 'BMS' + Date.now().toString(36).toUpperCase() };
                    setMovieResult(ticket);
                    setBookedTickets(prev => [ticket, ...prev]);
                    setMovieStep('confirmed');
                    setBookingMovie(false);
                  }}
                >
                  <LinearGradient colors={[theme.accentAlt, '#4A2FCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="credit-card" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingMovie ? 'Booking…' : `Pay ₹${selectedSeats.length * selectedShow.price}`}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 4 — Confirmed */}
            {movieStep === 'confirmed' && movieResult && (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(129,128,255,0.22)', 'rgba(129,128,255,0.34)'] : [(theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), '#E9E0FF']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color={theme.accentAlt} />
                </LinearGradient>
                <Text style={styles.resultTitle}>Tickets Booked!</Text>
                <Text style={styles.resultSub}>Enjoy the show 🎬</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), marginTop: 12 }]}>
                  <Feather name="film" size={13} color={theme.accentAlt} />
                  <Text style={[styles.resultInfoChipText, { color: theme.accentAlt }]}>{movieResult.movie} · {movieResult.show}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="map-pin" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{movieResult.cinema}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="tag" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>Seats: {movieResult.seats.join(', ')} · ₹{movieResult.amount}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="hash" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{movieResult.bookingId}</Text>
                </View>
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE') }]} onPress={() => setMovieModal(false)}>
                  <Text style={[styles.resultDoneBtnText, { color: theme.accentAlt }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Food Modal */}
      <Modal visible={foodModal} transparent animationType="slide" onRequestClose={() => setFoodModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={() => setFoodModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={[theme.warning, '#E8943A']} style={styles.agentIconGrad}>
                <Feather name="shopping-bag" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>
                  {foodStep === 'input' ? 'Order Food' : foodStep === 'restaurants' ? 'Pick a Restaurant' : foodStep === 'cart' ? 'Your Order' : 'Order Placed!'}
                </Text>
                <Text style={styles.agentSubtitle}>Swiggy · Zomato</Text>
              </View>
              {(foodStep === 'restaurants' || foodStep === 'cart') && (
                <TouchableOpacity onPress={() => setFoodStep(foodStep === 'cart' ? 'restaurants' : 'input')} style={[styles.backChip, { borderColor: theme.warning }]}>
                  <Feather name="arrow-left" size={14} color={theme.warning} />
                </TouchableOpacity>
              )}
            </View>

            {foodStep === 'input' && (
              <>
                <View style={styles.routeInputBlock}>
                  <View style={styles.routeInputRow}>
                    <Feather name="search" size={14} color={theme.faint} />
                    <TextInput
                      style={styles.routeInput}
                      placeholder="What are you craving? e.g. biryani, pizza"
                      placeholderTextColor={theme.placeholder}
                      value={foodQuery}
                      onChangeText={setFoodQuery}
                    />
                  </View>
                </View>
                <View style={[styles.aiContextRow, { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.12)' : '#FEF9EE') }]}>
                  <Feather name="zap" size={12} color={theme.warning} />
                  <Text style={[styles.aiContextText, { color: theme.warning }]}>AI picks the best restaurants based on your preferences</Text>
                </View>
                {foodError ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={theme.danger} />
                    <Text style={styles.errorText}>{foodError}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.actionBtn} onPress={fetchFoodSuggestions} disabled={fetchingFood}>
                  <LinearGradient colors={[theme.warning, '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{fetchingFood ? 'Finding restaurants…' : 'Find Restaurants'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {foodStep === 'restaurants' && (
              <>
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {foodSuggestions.map((r, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.foodRestCard, selectedRestaurant?.restaurant === r.restaurant && styles.foodRestCardSelected]}
                      onPress={() => { setSelectedRestaurant(r); setFoodStep('cart'); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.foodRestTop}>
                        <Text style={styles.foodRestName}>{r.restaurant}</Text>
                        <View style={styles.foodRestRating}>
                          <Text style={styles.foodRestRatingText}>⭐ {r.rating}</Text>
                        </View>
                      </View>
                      <Text style={styles.foodRestMeta}>{r.cuisine} · {r.deliveryTime} · {r.platform}</Text>
                      <Text style={styles.foodRestItems}>{(r.items || []).map(it => it.name).join(', ')}</Text>
                      <Text style={styles.foodRestTotal}>₹{r.totalAmount}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {foodStep === 'cart' && selectedRestaurant && (
              <>
                <View style={styles.cartRestHeader}>
                  <Text style={styles.cartRestName}>{selectedRestaurant.restaurant}</Text>
                  <Text style={styles.cartRestMeta}>{selectedRestaurant.cuisine} · {selectedRestaurant.deliveryTime}</Text>
                </View>
                {(selectedRestaurant.items || []).map((item, i) => (
                  <View key={i} style={styles.cartItemRow}>
                    <View style={styles.cartItemDot} />
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>₹{item.price}</Text>
                  </View>
                ))}
                <View style={styles.cartTotalRow}>
                  <Text style={styles.cartTotalLabel}>Total</Text>
                  <Text style={styles.cartTotalAmount}>₹{selectedRestaurant.totalAmount}</Text>
                </View>
                <TouchableOpacity style={[styles.actionBtn, { marginTop: 12 }]} onPress={confirmFood} disabled={orderingFood}>
                  <LinearGradient colors={[theme.warning, '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="shopping-bag" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{orderingFood ? 'Placing order…' : `Place Order · ₹${selectedRestaurant.totalAmount}`}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {foodStep === 'confirmed' && foodResult && (
              <View style={styles.resultWrap}>
                <LinearGradient colors={theme.isDark ? ['rgba(255,184,77,0.22)', 'rgba(255,184,77,0.34)'] : [(theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), '#FDE68A']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color={theme.warning} />
                </LinearGradient>
                <Text style={styles.resultTitle}>Order Confirmed!</Text>
                <Text style={styles.resultSub}>Arriving in {foodResult.deliveryTime || '35-45 mins'}</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), marginTop: 12 }]}>
                  <Feather name="shopping-bag" size={13} color={theme.warning} />
                  <Text style={[styles.resultInfoChipText, { color: theme.warning }]}>{foodResult.restaurant} · ₹{foodResult.totalAmount}</Text>
                </View>
                <View style={[styles.resultInfoChip, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}>
                  <Feather name="hash" size={13} color={theme.muted} />
                  <Text style={[styles.resultInfoChipText, { color: theme.textSecondary }]}>{foodResult.orderId}</Text>
                </View>
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7') }]} onPress={() => setFoodModal(false)}>
                  <Text style={[styles.resultDoneBtnText, { color: theme.warning }]}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color={theme.faint} />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.faint, marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), alignItems: 'center', justifyContent: 'center' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  quickCard: { width: '47.5%', borderRadius: 18, padding: 16, alignItems: 'center' },
  quickIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickLabel: { fontSize: 13, fontWeight: '800' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: theme.muted, letterSpacing: 0.5, marginBottom: 12 },
  sectionCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  listSkeleton: { height: 52, backgroundColor: theme.border, borderRadius: 12, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: theme.faint, fontWeight: '600', textAlign: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rideIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  movieIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: (theme.isDark ? 'rgba(129,128,255,0.16)' : '#F3EFFE'), alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  movieBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border, marginBottom: 4 },
  movieBannerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  movieBannerTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
  movieBannerSub: { fontSize: 12, color: theme.faint, marginTop: 2 },
  foodIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTextWrap: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  listSubtitle: { fontSize: 12, color: theme.faint },
  rideBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  rideBadgeText: { fontSize: 10, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginBottom: 20 },
  // AI Agent header
  agentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  agentIconGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  agentHeaderText: { flex: 1 },
  agentTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  agentSubtitle: { fontSize: 12, color: theme.faint, marginTop: 2 },
  agentPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  agentPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },
  agentPillText: { fontSize: 11, fontWeight: '700', color: theme.accent },
  // Route input block (cab)
  routeInputBlock: { backgroundColor: theme.surfaceAlt, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14 },
  routeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  routeDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent },
  routeInput: { flex: 1, fontSize: 15, color: theme.text },
  routeInputDivider: { height: 1, backgroundColor: theme.borderStrong, marginLeft: 20 },
  // AI context hint
  aiContextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), borderRadius: 12, padding: 12, marginBottom: 16 },
  aiContextText: { flex: 1, fontSize: 12, color: theme.accent, lineHeight: 17 },
  optionalTag: { fontSize: 12, color: theme.faint, fontWeight: '400' },
  // Result state
  resultWrap: { alignItems: 'center', paddingVertical: 16, paddingBottom: 8 },
  resultIconWrap: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 6 },
  resultSub: { fontSize: 13, color: theme.muted, marginBottom: 4, textAlign: 'center' },
  resultRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resultRouteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent },
  resultRouteText: { fontSize: 14, fontWeight: '600', color: theme.text },
  resultRouteDivider: { width: 1, height: 16, backgroundColor: theme.borderStrong, marginLeft: 3, marginVertical: 2 },
  resultInfoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  resultInfoChipText: { fontSize: 13, fontWeight: '700' },
  resultDoneBtn: { marginTop: 20, backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6'), borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  resultDoneBtnText: { fontSize: 15, fontWeight: '700', color: theme.accent },
  // Shared input styles (used by Flight, Hotel, Track modals)
  modalTitle: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: theme.faint, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  modalInput: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: theme.text, marginBottom: 16 },
  actionBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: theme.faint, marginTop: 4, letterSpacing: 0.3 },
  // Back chip
  backChip: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  // Cab option cards
  cabOptionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  cabOptionCardSelected: { borderColor: theme.accent, backgroundColor: (theme.isDark ? 'rgba(52,199,123,0.16)' : '#EFFDF6') },
  cabOptionLeft: { flex: 1 },
  cabOptionLabel: { fontSize: 15, fontWeight: '800', color: theme.text },
  cabOptionMeta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  cabOptionDriver: { fontSize: 11, color: theme.faint, marginTop: 2 },
  cabOptionRight: { alignItems: 'flex-end', marginRight: 8 },
  cabOptionFare: { fontSize: 18, fontWeight: '800', color: theme.text },
  cabOptionEta: { fontSize: 12, color: theme.muted, marginTop: 2 },
  cabOptionCheck: { position: 'absolute', top: 10, right: 10 },
  // Food restaurant cards
  foodRestCard: { backgroundColor: theme.surfaceAlt, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  foodRestCardSelected: { borderColor: theme.warning, backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.12)' : '#FEF9EE') },
  foodRestTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  foodRestName: { fontSize: 15, fontWeight: '800', color: theme.text },
  foodRestRating: { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.16)' : '#FEF3C7'), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  foodRestRatingText: { fontSize: 11, fontWeight: '700', color: theme.warning },
  foodRestMeta: { fontSize: 12, color: theme.muted, marginBottom: 4 },
  foodRestItems: { fontSize: 12, color: theme.faint, marginBottom: 6 },
  foodRestTotal: { fontSize: 15, fontWeight: '800', color: theme.text },
  // Cart
  cartRestHeader: { backgroundColor: (theme.isDark ? 'rgba(255,184,77,0.12)' : '#FEF9EE'), borderRadius: 14, padding: 14, marginBottom: 14 },
  cartRestName: { fontSize: 16, fontWeight: '800', color: theme.text },
  cartRestMeta: { fontSize: 12, color: theme.faint, marginTop: 2 },
  cartItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  cartItemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.warning, marginRight: 10 },
  cartItemName: { flex: 1, fontSize: 14, color: theme.text, fontWeight: '600' },
  cartItemPrice: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  cartTotalLabel: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
  cartTotalAmount: { fontSize: 18, fontWeight: '800', color: theme.text },
  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: (theme.isDark ? 'rgba(241,113,134,0.16)' : '#FCEAED'), borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 12, color: theme.danger, fontWeight: '600' },
});
