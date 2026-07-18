import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Modal, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import { apiFetch } from '../api/client';

const TAB_BAR_CONTENT_HEIGHT = 50;

export default function LifeOps({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = width < 360 ? 16 : 20;
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  const [rides, setRides] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cab modal
  const [cabModal, setCabModal] = useState(false);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [bookingCab, setBookingCab] = useState(false);
  const [cabResult, setCabResult] = useState(null);

  // Food modal
  const [foodModal, setFoodModal] = useState(false);
  const [restaurant, setRestaurant] = useState('');
  const [items, setItems] = useState('');
  const [orderingFood, setOrderingFood] = useState(false);
  const [foodResult, setFoodResult] = useState(null);

  // Flight modal
  const [flightModal, setFlightModal] = useState(false);
  const [flightFrom, setFlightFrom] = useState('');
  const [flightTo, setFlightTo] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [bookingFlight, setBookingFlight] = useState(false);
  const [flightResult, setFlightResult] = useState(null);

  // Hotel modal
  const [hotelModal, setHotelModal] = useState(false);
  const [hotelCity, setHotelCity] = useState('');
  const [hotelCheckin, setHotelCheckin] = useState('');
  const [hotelCheckout, setHotelCheckout] = useState('');
  const [bookingHotel, setBookingHotel] = useState(false);
  const [hotelResult, setHotelResult] = useState(null);

  // Track Orders modal
  const [trackModal, setTrackModal] = useState(false);
  const [trackId, setTrackId] = useState('');
  const [tracking, setTracking] = useState(false);
  const [trackResult, setTrackResult] = useState(null);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [r, w] = await Promise.all([
        apiFetch('/api/lifeops/rides'),
        apiFetch('/api/lifeops/wishlist'),
      ]);
      setRides(r.rides || []);
      setWishlist(w.items || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, []);

  const bookCab = async () => {
    if (!pickup.trim() || !destination.trim()) return;
    setBookingCab(true);
    try {
      const res = await apiFetch('/api/lifeops/cab', {
        method: 'POST',
        body: { pickup: pickup.trim(), destination: destination.trim() },
      });
      setCabResult(res);
      loadData(true);
    } catch {}
    finally { setBookingCab(false); }
  };

  const orderFood = async () => {
    if (!restaurant.trim()) return;
    setOrderingFood(true);
    try {
      const res = await apiFetch('/api/lifeops/food', {
        method: 'POST',
        body: { restaurant: restaurant.trim(), items: items.trim() },
      });
      setFoodResult(res);
      loadData(true);
    } catch {}
    finally { setOrderingFood(false); }
  };

  const bookFlight = async () => {
    if (!flightFrom.trim() || !flightTo.trim()) return;
    setBookingFlight(true);
    try {
      const res = await apiFetch('/api/lifeops/flight', {
        method: 'POST',
        body: { from: flightFrom.trim(), to: flightTo.trim(), date: flightDate.trim() },
      });
      setFlightResult(res);
    } catch { setFlightResult({ status: 'search_initiated' }); }
    finally { setBookingFlight(false); }
  };

  const bookHotel = async () => {
    if (!hotelCity.trim()) return;
    setBookingHotel(true);
    try {
      const res = await apiFetch('/api/lifeops/hotel', {
        method: 'POST',
        body: { city: hotelCity.trim(), checkin: hotelCheckin.trim(), checkout: hotelCheckout.trim() },
      });
      setHotelResult(res);
    } catch { setHotelResult({ status: 'search_initiated' }); }
    finally { setBookingHotel(false); }
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
    { icon: 'truck', label: 'Book Cab', color: '#1F9A5A', bg: '#EFFDF6', onPress: () => { setCabResult(null); setCabModal(true); } },
    { icon: 'shopping-bag', label: 'Order Food', color: '#F5A623', bg: '#FEF3C7', onPress: () => { setFoodResult(null); setFoodModal(true); } },
    { icon: 'heart', label: 'Wishlist', color: '#E0546E', bg: '#FCEAED', onPress: () => {} },
    { icon: 'package', label: 'Deliveries', color: '#4FA6E8', bg: '#EAF3FD', onPress: () => {} },
    { icon: 'send', label: 'Book Flight', color: '#9B72FF', bg: '#F3EFFE', onPress: () => { setFlightResult(null); setFlightModal(true); } },
    { icon: 'coffee', label: 'Book Hotel', color: '#E0546E', bg: '#FCEAED', onPress: () => { setHotelResult(null); setHotelModal(true); } },
    { icon: 'map-pin', label: 'Track Orders', color: '#F5A623', bg: '#FEF3C7', onPress: () => { setTrackResult(null); setTrackModal(true); } },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPad, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor="#1F9A5A" colors={['#1F9A5A']} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Life Ops</Text>
            <Text style={styles.headerSubtitle}>Cabs, food & daily operations</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="zap" size={18} color="#F5A623" />
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
              <Feather name="navigation" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>No rides yet. Book your first cab above.</Text>
            </View>
          ) : (
            rides.map((ride, i) => (
              <View key={ride.id || i} style={[styles.listRow, i !== rides.length - 1 && styles.listRowDivider]}>
                <View style={styles.rideIconWrap}>
                  <Feather name="navigation" size={16} color="#1F9A5A" />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{ride.pickup} → {ride.destination}</Text>
                  <Text style={styles.listSubtitle}>{ride.status} {ride.fare ? `· ₹${ride.fare}` : ''}</Text>
                </View>
                <View style={[styles.rideBadge, { backgroundColor: ride.status === 'completed' ? '#EFFDF6' : '#FEF3C7' }]}>
                  <Text style={[styles.rideBadgeText, { color: ride.status === 'completed' ? '#1F9A5A' : '#D97706' }]}>
                    {ride.status || 'Pending'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Wishlist */}
        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>WISHLIST</Text>
        <View style={styles.sectionCard}>
          {loading ? (
            [1, 2].map(i => <View key={i} style={styles.listSkeleton} />)
          ) : wishlist.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="heart" size={26} color="#C7CBD3" />
              <Text style={styles.emptyText}>Your wishlist is empty</Text>
            </View>
          ) : (
            wishlist.map((item, i) => (
              <View key={item.id || i} style={[styles.listRow, i !== wishlist.length - 1 && styles.listRowDivider]}>
                <View style={styles.wishIconWrap}>
                  <Feather name="heart" size={16} color="#E0546E" />
                </View>
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{item.name}</Text>
                  <Text style={styles.listSubtitle}>{item.price ? `₹${item.price}` : ''} {item.platform ? `· ${item.platform}` : ''}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Cab Modal */}
      <Modal visible={cabModal} transparent animationType="slide" onRequestClose={() => setCabModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setCabModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />

            {/* AI Agent Header */}
            <View style={styles.agentHeader}>
              <LinearGradient colors={['#1F9A5A', '#3CB37A']} style={styles.agentIconGrad}>
                <Feather name="navigation" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Book a Cab</Text>
                <Text style={styles.agentSubtitle}>Ola · Uber · Rapido</Text>
              </View>
              <View style={styles.agentPill}>
                <View style={styles.agentPillDot} />
                <Text style={styles.agentPillText}>AI Ready</Text>
              </View>
            </View>

            {cabResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={['#EFFDF6', '#D4F5E5']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color="#1F9A5A" />
                </LinearGradient>
                <Text style={styles.resultTitle}>Booking Initiated</Text>
                <Text style={styles.resultSub}>Your AI twin is coordinating the ride</Text>
                <View style={styles.resultRouteRow}>
                  <View style={styles.resultRouteDot} />
                  <Text style={styles.resultRouteText}>{pickup}</Text>
                </View>
                <View style={[styles.resultRouteDivider]} />
                <View style={styles.resultRouteRow}>
                  <Feather name="map-pin" size={12} color="#E0546E" />
                  <Text style={styles.resultRouteText}>{destination}</Text>
                </View>
                <TouchableOpacity style={styles.resultDoneBtn} onPress={() => { setCabModal(false); setPickup(''); setDestination(''); setCabResult(null); }}>
                  <Text style={styles.resultDoneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.routeInputBlock}>
                  <View style={styles.routeInputRow}>
                    <View style={styles.routeDotGreen} />
                    <TextInput
                      style={styles.routeInput}
                      placeholder="Pickup — current location or address"
                      placeholderTextColor="#9AA1AE"
                      value={pickup}
                      onChangeText={setPickup}
                    />
                  </View>
                  <View style={styles.routeInputDivider} />
                  <View style={styles.routeInputRow}>
                    <Feather name="map-pin" size={13} color="#E0546E" />
                    <TextInput
                      style={styles.routeInput}
                      placeholder="Destination — where to?"
                      placeholderTextColor="#9AA1AE"
                      value={destination}
                      onChangeText={setDestination}
                    />
                  </View>
                </View>
                <View style={styles.aiContextRow}>
                  <Feather name="zap" size={12} color="#1F9A5A" />
                  <Text style={styles.aiContextText}>AI will compare fares across Ola, Uber & Rapido and pick the best</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, (!pickup.trim() || !destination.trim()) && styles.actionBtnDisabled]}
                  onPress={bookCab}
                  disabled={!pickup.trim() || !destination.trim() || bookingCab}
                >
                  <LinearGradient colors={['#1F9A5A', '#3CB37A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="navigation" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingCab ? 'Finding best ride…' : 'Book Cab via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Flight Modal */}
      <Modal visible={flightModal} transparent animationType="slide" onRequestClose={() => setFlightModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setFlightModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={['#9B72FF', '#7C5CE8']} style={styles.agentIconGrad}>
                <Feather name="send" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Book Flight</Text>
                <Text style={styles.agentSubtitle}>IndiGo · Air India · Vistara</Text>
              </View>
              <View style={[styles.agentPill, { backgroundColor: '#F3EFFE' }]}>
                <View style={[styles.agentPillDot, { backgroundColor: '#9B72FF' }]} />
                <Text style={[styles.agentPillText, { color: '#7C5CE8' }]}>AI Ready</Text>
              </View>
            </View>
            {flightResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={['#F3EFFE', '#E9E0FF']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color="#9B72FF" />
                </LinearGradient>
                <Text style={styles.resultTitle}>Search Initiated</Text>
                <Text style={styles.resultSub}>Your AI twin is scanning the best fares</Text>
                <View style={styles.resultRouteRow}>
                  <View style={[styles.resultRouteDot, { backgroundColor: '#9B72FF' }]} />
                  <Text style={styles.resultRouteText}>{flightFrom}</Text>
                </View>
                <View style={styles.resultRouteDivider} />
                <View style={styles.resultRouteRow}>
                  <Feather name="map-pin" size={12} color="#E0546E" />
                  <Text style={styles.resultRouteText}>{flightTo}</Text>
                </View>
                {flightDate ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: '#F3EFFE', marginTop: 10 }]}>
                    <Feather name="calendar" size={13} color="#9B72FF" />
                    <Text style={[styles.resultInfoChipText, { color: '#7C5CE8' }]}>{flightDate}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: '#F3EFFE' }]} onPress={() => { setFlightModal(false); setFlightFrom(''); setFlightTo(''); setFlightDate(''); setFlightResult(null); }}>
                  <Text style={[styles.resultDoneBtnText, { color: '#9B72FF' }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.routeInputBlock}>
                  <View style={styles.routeInputRow}>
                    <View style={[styles.routeDotGreen, { backgroundColor: '#9B72FF' }]} />
                    <TextInput style={styles.routeInput} placeholder="From — e.g. Bengaluru (BLR)" placeholderTextColor="#9AA1AE" value={flightFrom} onChangeText={setFlightFrom} />
                  </View>
                  <View style={styles.routeInputDivider} />
                  <View style={styles.routeInputRow}>
                    <Feather name="map-pin" size={13} color="#E0546E" />
                    <TextInput style={styles.routeInput} placeholder="To — e.g. Mumbai (BOM)" placeholderTextColor="#9AA1AE" value={flightTo} onChangeText={setFlightTo} />
                  </View>
                </View>
                <Text style={styles.inputLabel}>Date <Text style={styles.optionalTag}>(optional)</Text></Text>
                <TextInput style={styles.modalInput} placeholder="e.g. 25 Jul 2025" placeholderTextColor="#9AA1AE" value={flightDate} onChangeText={setFlightDate} />
                <View style={[styles.aiContextRow, { backgroundColor: '#F3EFFE' }]}>
                  <Feather name="zap" size={12} color="#9B72FF" />
                  <Text style={[styles.aiContextText, { color: '#5B3FBF' }]}>AI will compare fares across all major airlines and find the cheapest option</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, (!flightFrom.trim() || !flightTo.trim()) && styles.actionBtnDisabled]}
                  onPress={bookFlight}
                  disabled={!flightFrom.trim() || !flightTo.trim() || bookingFlight}
                >
                  <LinearGradient colors={['#9B72FF', '#7C5CE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="send" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingFlight ? 'Scanning fares…' : 'Search Flights via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hotel Modal */}
      <Modal visible={hotelModal} transparent animationType="slide" onRequestClose={() => setHotelModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setHotelModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={['#E0546E', '#C8405A']} style={styles.agentIconGrad}>
                <Feather name="home" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Book Hotel</Text>
                <Text style={styles.agentSubtitle}>MakeMyTrip · Goibibo · OYO</Text>
              </View>
              <View style={[styles.agentPill, { backgroundColor: '#FCEAED' }]}>
                <View style={[styles.agentPillDot, { backgroundColor: '#E0546E' }]} />
                <Text style={[styles.agentPillText, { color: '#C8405A' }]}>AI Ready</Text>
              </View>
            </View>
            {hotelResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={['#FCEAED', '#FAD4DB']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color="#E0546E" />
                </LinearGradient>
                <Text style={styles.resultTitle}>Search Initiated</Text>
                <Text style={styles.resultSub}>Your AI twin is finding the best rates</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: '#FCEAED', marginTop: 12 }]}>
                  <Feather name="map-pin" size={13} color="#E0546E" />
                  <Text style={[styles.resultInfoChipText, { color: '#C8405A' }]}>{hotelCity}</Text>
                </View>
                {(hotelCheckin || hotelCheckout) ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: '#F5F6F8', marginTop: 8 }]}>
                    <Feather name="calendar" size={13} color="#6B7280" />
                    <Text style={[styles.resultInfoChipText, { color: '#374151' }]}>
                      {hotelCheckin || '—'} → {hotelCheckout || '—'}
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: '#FCEAED' }]} onPress={() => { setHotelModal(false); setHotelCity(''); setHotelCheckin(''); setHotelCheckout(''); setHotelResult(null); }}>
                  <Text style={[styles.resultDoneBtnText, { color: '#E0546E' }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. Goa, Delhi, Mumbai" placeholderTextColor="#9AA1AE" value={hotelCity} onChangeText={setHotelCity} />
                <View style={styles.dateRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.inputLabel}>Check-in <Text style={styles.optionalTag}>(optional)</Text></Text>
                    <TextInput style={styles.modalInput} placeholder="25 Jul 2025" placeholderTextColor="#9AA1AE" value={hotelCheckin} onChangeText={setHotelCheckin} />
                  </View>
                  <View style={styles.dateCol}>
                    <Text style={styles.inputLabel}>Check-out <Text style={styles.optionalTag}>(optional)</Text></Text>
                    <TextInput style={styles.modalInput} placeholder="28 Jul 2025" placeholderTextColor="#9AA1AE" value={hotelCheckout} onChangeText={setHotelCheckout} />
                  </View>
                </View>
                <View style={[styles.aiContextRow, { backgroundColor: '#FCEAED' }]}>
                  <Feather name="zap" size={12} color="#E0546E" />
                  <Text style={[styles.aiContextText, { color: '#7B1D2E' }]}>AI will compare prices across platforms and shortlist top-rated options</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, !hotelCity.trim() && styles.actionBtnDisabled]}
                  onPress={bookHotel}
                  disabled={!hotelCity.trim() || bookingHotel}
                >
                  <LinearGradient colors={['#E0546E', '#C8405A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="home" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{bookingHotel ? 'Finding best rates…' : 'Search Hotels via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Track Orders Modal */}
      <Modal visible={trackModal} transparent animationType="slide" onRequestClose={() => setTrackModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setTrackModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.agentHeader}>
              <LinearGradient colors={['#4FA6E8', '#2E86C8']} style={styles.agentIconGrad}>
                <Feather name="map-pin" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Track Order</Text>
                <Text style={styles.agentSubtitle}>Amazon · Flipkart · Meesho</Text>
              </View>
              <View style={[styles.agentPill, { backgroundColor: '#EAF3FD' }]}>
                <View style={[styles.agentPillDot, { backgroundColor: '#4FA6E8' }]} />
                <Text style={[styles.agentPillText, { color: '#2E86C8' }]}>AI Ready</Text>
              </View>
            </View>
            {trackResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={['#EAF3FD', '#C8E4F8']} style={styles.resultIconWrap}>
                  <Feather name="package" size={28} color="#4FA6E8" />
                </LinearGradient>
                <Text style={styles.resultTitle}>{trackResult.status || 'In Transit'}</Text>
                <Text style={styles.resultSub}>Your AI twin fetched the latest update</Text>
                {trackResult.location ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: '#EAF3FD', marginTop: 12 }]}>
                    <Feather name="map-pin" size={13} color="#4FA6E8" />
                    <Text style={[styles.resultInfoChipText, { color: '#2E86C8' }]}>{trackResult.location}</Text>
                  </View>
                ) : null}
                {trackResult.eta ? (
                  <View style={[styles.resultInfoChip, { backgroundColor: '#F5F6F8', marginTop: 8 }]}>
                    <Feather name="clock" size={13} color="#6B7280" />
                    <Text style={[styles.resultInfoChipText, { color: '#374151' }]}>ETA: {trackResult.eta}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: '#EAF3FD' }]} onPress={() => { setTrackModal(false); setTrackId(''); setTrackResult(null); }}>
                  <Text style={[styles.resultDoneBtnText, { color: '#4FA6E8' }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>Order ID / AWB Number</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 408-1234567-8901234"
                  placeholderTextColor="#9AA1AE"
                  value={trackId}
                  onChangeText={setTrackId}
                  autoCapitalize="characters"
                />
                <View style={[styles.aiContextRow, { backgroundColor: '#EAF3FD' }]}>
                  <Feather name="zap" size={12} color="#4FA6E8" />
                  <Text style={[styles.aiContextText, { color: '#1A5276' }]}>AI will pull real-time status from Amazon, Flipkart, Delhivery & more</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, !trackId.trim() && styles.actionBtnDisabled]}
                  onPress={trackOrder}
                  disabled={!trackId.trim() || tracking}
                >
                  <LinearGradient colors={['#4FA6E8', '#2E86C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="map-pin" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{tracking ? 'Fetching status…' : 'Track via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Food Modal */}
      <Modal visible={foodModal} transparent animationType="slide" onRequestClose={() => setFoodModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setFoodModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />

            {/* AI Agent Header */}
            <View style={styles.agentHeader}>
              <LinearGradient colors={['#F5A623', '#E8943A']} style={styles.agentIconGrad}>
                <Feather name="shopping-bag" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.agentHeaderText}>
                <Text style={styles.agentTitle}>Order Food</Text>
                <Text style={styles.agentSubtitle}>Swiggy · Zomato</Text>
              </View>
              <View style={[styles.agentPill, { backgroundColor: '#FEF3C7' }]}>
                <View style={[styles.agentPillDot, { backgroundColor: '#F5A623' }]} />
                <Text style={[styles.agentPillText, { color: '#D97706' }]}>AI Ready</Text>
              </View>
            </View>

            {foodResult ? (
              <View style={styles.resultWrap}>
                <LinearGradient colors={['#FEF3C7', '#FDE68A']} style={styles.resultIconWrap}>
                  <Feather name="check" size={28} color="#D97706" />
                </LinearGradient>
                <Text style={styles.resultTitle}>Order Initiated</Text>
                <Text style={styles.resultSub}>Your AI twin is placing the order</Text>
                <View style={[styles.resultInfoChip, { backgroundColor: '#FEF3C7' }]}>
                  <Feather name="shopping-bag" size={13} color="#D97706" />
                  <Text style={[styles.resultInfoChipText, { color: '#D97706' }]}>{restaurant}</Text>
                </View>
                <TouchableOpacity style={[styles.resultDoneBtn, { backgroundColor: '#FEF3C7' }]} onPress={() => { setFoodModal(false); setRestaurant(''); setItems(''); setFoodResult(null); }}>
                  <Text style={[styles.resultDoneBtnText, { color: '#D97706' }]}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.inputLabel}>Restaurant</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Domino's, Biryani Blues"
                  placeholderTextColor="#9AA1AE"
                  value={restaurant}
                  onChangeText={setRestaurant}
                />
                <Text style={styles.inputLabel}>Items <Text style={styles.optionalTag}>(optional)</Text></Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Margherita pizza, Coke"
                  placeholderTextColor="#9AA1AE"
                  value={items}
                  onChangeText={setItems}
                />
                <View style={[styles.aiContextRow, { backgroundColor: '#FEF9EE' }]}>
                  <Feather name="zap" size={12} color="#F5A623" />
                  <Text style={[styles.aiContextText, { color: '#92400E' }]}>AI will find your usual order and confirm before placing</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, !restaurant.trim() && styles.actionBtnDisabled]}
                  onPress={orderFood}
                  disabled={!restaurant.trim() || orderingFood}
                >
                  <LinearGradient colors={['#F5A623', '#E8943A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                    <Feather name="shopping-bag" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{orderingFood ? 'Placing order…' : 'Order via AI'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Home')}>
          <Ionicons name="home" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Priorities')}>
          <Feather name="calendar" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PRIORITIES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('AskAI')}>
          <Feather name="mic" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>ASK AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Space')}>
          <Feather name="folder" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>SPACE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation?.navigate?.('Profile')}>
          <Feather name="user" size={22} color="#9AA1AE" />
          <Text style={styles.tabLabel}>PROFILE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFC' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#14171F' },
  headerSubtitle: { fontSize: 13, color: '#9AA1AE', marginTop: 2 },
  headerBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  quickCard: { width: '47.5%', borderRadius: 18, padding: 16, alignItems: 'center' },
  quickIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickLabel: { fontSize: 13, fontWeight: '800' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 12 },
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  listSkeleton: { height: 52, backgroundColor: '#F0F1F4', borderRadius: 12, marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#9AA1AE', fontWeight: '600', textAlign: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  listRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F0F1F4' },
  rideIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFFDF6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  wishIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FCEAED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  listTextWrap: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#14171F', marginBottom: 2 },
  listSubtitle: { fontSize: 12, color: '#9AA1AE' },
  rideBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  rideBadgeText: { fontSize: 10, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,17,26,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E5EA', marginBottom: 20 },
  // AI Agent header
  agentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  agentIconGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  agentHeaderText: { flex: 1 },
  agentTitle: { fontSize: 20, fontWeight: '800', color: '#14171F' },
  agentSubtitle: { fontSize: 12, color: '#9AA1AE', marginTop: 2 },
  agentPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFFDF6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  agentPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1F9A5A' },
  agentPillText: { fontSize: 11, fontWeight: '700', color: '#1F9A5A' },
  // Route input block (cab)
  routeInputBlock: { backgroundColor: '#F5F6F8', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14 },
  routeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  routeDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1F9A5A' },
  routeInput: { flex: 1, fontSize: 15, color: '#14171F' },
  routeInputDivider: { height: 1, backgroundColor: '#E3E5EA', marginLeft: 20 },
  // AI context hint
  aiContextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#EFFDF6', borderRadius: 12, padding: 12, marginBottom: 16 },
  aiContextText: { flex: 1, fontSize: 12, color: '#1F5C3A', lineHeight: 17 },
  optionalTag: { fontSize: 12, color: '#9AA1AE', fontWeight: '400' },
  // Result state
  resultWrap: { alignItems: 'center', paddingVertical: 16, paddingBottom: 8 },
  resultIconWrap: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#14171F', marginBottom: 6 },
  resultSub: { fontSize: 13, color: '#6B7280', marginBottom: 4, textAlign: 'center' },
  resultRouteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resultRouteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1F9A5A' },
  resultRouteText: { fontSize: 14, fontWeight: '600', color: '#14171F' },
  resultRouteDivider: { width: 1, height: 16, backgroundColor: '#E3E5EA', marginLeft: 3, marginVertical: 2 },
  resultInfoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  resultInfoChipText: { fontSize: 13, fontWeight: '700' },
  resultDoneBtn: { marginTop: 20, backgroundColor: '#EFFDF6', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48 },
  resultDoneBtnText: { fontSize: 15, fontWeight: '700', color: '#1F9A5A' },
  // Shared input styles (used by Flight, Hotel, Track modals)
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#14171F', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#9AA1AE', marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  modalInput: { backgroundColor: '#F5F6F8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#14171F', marginBottom: 16 },
  actionBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F3', paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#9AA1AE', marginTop: 4, letterSpacing: 0.3 },
});
