/**
 * Tenants Management Page
 * View plots, units, and assign/manage tenants
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/page-header';
import { Sidebar } from '../../components/sidebar';
import { borderRadius, spacing, typography } from '../../constants/design';
import { useThemedColors } from '../../hooks/use-themed-colors';
import {
  assignTenantToUnit,
  getAllPlots,
  PlotRecord,
  removeTenantFromUnit,
  updateTenantInUnit
} from '../../services/firestore-service';

interface HouseUnit {
  id: string;
  houseNo: string;
  baseRent: number;
  garbageFees: number;
  previousWaterUnits: number;
  currentWaterUnits: number;
  tenant: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  depositPaid?: number | null;
  monthRented?: number | null;
  yearRented?: number | null;
}

interface PlotWithUnits extends PlotRecord {
  houses: HouseUnit[];
  occupiedUnits: number;
  vacantUnits: number;
}

const MONTH_OPTIONS = [
  { label: 'Jan', value: '1' },
  { label: 'Feb', value: '2' },
  { label: 'Mar', value: '3' },
  { label: 'Apr', value: '4' },
  { label: 'May', value: '5' },
  { label: 'Jun', value: '6' },
  { label: 'Jul', value: '7' },
  { label: 'Aug', value: '8' },
  { label: 'Sep', value: '9' },
  { label: 'Oct', value: '10' },
  { label: 'Nov', value: '11' },
  { label: 'Dec', value: '12' },
];

export default function Tenants() {
  const themedColors = useThemedColors();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plots, setPlots] = useState<PlotWithUnits[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<PlotWithUnits | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<HouseUnit | null>(null);
  
  // Form state for tenant assignment
  const [tenantName, setTenantName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [depositPaid, setDepositPaid] = useState('');
  const currentDate = new Date();
  const [monthRented, setMonthRented] = useState((currentDate.getMonth() + 1).toString());
  const [yearRented, setYearRented] = useState(currentDate.getFullYear().toString());
  const [editTenantName, setEditTenantName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editMonthRented, setEditMonthRented] = useState((currentDate.getMonth() + 1).toString());
  const [editYearRented, setEditYearRented] = useState(currentDate.getFullYear().toString());
  const [saving, setSaving] = useState(false);

  // Load plots from Firestore
  const loadPlots = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedPlots = await getAllPlots();
      
      // Process plots to add occupancy statistics and IDs
      const plotsWithStats: PlotWithUnits[] = fetchedPlots.map(plot => {
        const housesWithIds = plot.houses.map((house, index) => ({
          ...house,
          id: `house-${plot.id}-${index}-${Date.now()}`,
        } as HouseUnit));

        const occupiedUnits = housesWithIds.filter(h => h.tenant).length;
        const vacantUnits = housesWithIds.length - occupiedUnits;

        return {
          ...plot,
          houses: housesWithIds,
          occupiedUnits,
          vacantUnits,
        };
      });
      
      setPlots(plotsWithStats);
    } catch (error) {
      console.error('[Tenants] Error loading plots:', error);
      Alert.alert('Error', 'Failed to load plots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlots();
  }, [loadPlots]);

  // Filter plots by search query
  const filteredPlots = useMemo(() => {
    if (!searchQuery.trim()) return plots;
    
    const lowerQuery = searchQuery.toLowerCase();
    return plots.filter(plot => {
      // Search by plot name
      if (plot.plotName.toLowerCase().includes(lowerQuery)) return true;
      
      // Search by house number or tenant name
      return plot.houses.some(house => 
        house.houseNo.toLowerCase().includes(lowerQuery) ||
        (house.tenantName && house.tenantName.toLowerCase().includes(lowerQuery))
      );
    });
  }, [plots, searchQuery]);

  // Validate phone number (must start with 01 or 07 and be 10 digits)
  const validatePhoneNumber = (phone: string): boolean => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length !== 10) return false;
    if (!cleaned.startsWith('01') && !cleaned.startsWith('07')) return false;
    return /^\d+$/.test(cleaned);
  };

  const formatPhoneForInput = (phone?: string | null): string => {
    if (!phone) return '';
    if (phone.startsWith('254') && phone.length >= 12) {
      return '0' + phone.substring(3);
    }
    return phone;
  };

  // Handle assigning tenant to unit
  const handleAssignTenant = (plot: PlotWithUnits, unit: HouseUnit) => {
    if (unit.tenant) {
      Alert.alert(
        'Unit Occupied',
        `This unit is already occupied by ${unit.tenantName}. Remove the current tenant first.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setSelectedPlot(plot);
    setSelectedUnit(unit);
    setTenantName('');
    setPhoneNumber('');
    setDepositPaid('');
    setMonthRented((currentDate.getMonth() + 1).toString());
    setYearRented(currentDate.getFullYear().toString());
    setAssignModalVisible(true);
  };

  // Handle saving tenant assignment
  const handleSaveTenant = async () => {
    if (!selectedPlot || !selectedUnit) return;

    // Validation
    if (!tenantName.trim()) {
      Alert.alert('Validation Error', 'Please enter tenant name');
      return;
    }

    const cleanedPhone = phoneNumber.replace(/\s/g, '');
    if (!validatePhoneNumber(cleanedPhone)) {
      Alert.alert(
        'Invalid Phone Number',
        'Phone number must start with 01 or 07 and be exactly 10 digits (e.g., 0712345678)'
      );
      return;
    }

    // Check for duplicate phone number across all plots
    const formattedPhone = cleanedPhone.startsWith('0')
      ? '254' + cleanedPhone.substring(1)
      : cleanedPhone;
    for (const plot of plots) {
      for (const h of plot.houses) {
        if (
          h.tenantPhone === formattedPhone &&
          !(plot.id === selectedPlot.id && h.houseNo === selectedUnit.houseNo)
        ) {
          Alert.alert(
            'Duplicate Phone Number',
            `This phone number is already assigned to ${h.tenantName ?? 'a tenant'} in ${plot.plotName}, Unit ${h.houseNo}.`
          );
          return;
        }
      }
    }

    const deposit = parseFloat(depositPaid);
    if (isNaN(deposit) || deposit < 0) {
      Alert.alert('Validation Error', 'Please enter a valid deposit amount');
      return;
    }

    const month = parseInt(monthRented);
    if (isNaN(month) || month < 1 || month > 12) {
      Alert.alert('Validation Error', 'Month must be between 1 and 12');
      return;
    }

    const year = parseInt(yearRented);
    if (isNaN(year) || year < 2000 || year > 2100) {
      Alert.alert('Validation Error', 'Please enter a valid year');
      return;
    }

    setSaving(true);
    try {
      const result = await assignTenantToUnit(
        selectedPlot.id!,
        selectedUnit.houseNo,
        {
          tenantName: tenantName.trim(),
          phoneNumber: cleanedPhone,
          depositPaid: deposit,
          monthRented: month,
          yearRented: year,
        }
      );

      if (result.success) {
        Alert.alert('Success', 'Tenant assigned successfully');
        setAssignModalVisible(false);
        loadPlots(); // Reload to show updated data
      } else {
        Alert.alert('Error', result.error || 'Failed to assign tenant');
      }
    } catch (error) {
      console.error('[Tenants] Error assigning tenant:', error);
      Alert.alert('Error', 'Failed to assign tenant');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTenant = (plot: PlotWithUnits, unit: HouseUnit) => {
    if (!unit.tenant) return;

    setSelectedPlot(plot);
    setSelectedUnit(unit);
    setEditTenantName(unit.tenantName || '');
    setEditPhoneNumber(formatPhoneForInput(unit.tenantPhone));
    setEditMonthRented((unit.monthRented || (currentDate.getMonth() + 1)).toString());
    setEditYearRented((unit.yearRented || currentDate.getFullYear()).toString());
    setEditModalVisible(true);
  };

  const handleSaveTenantEdit = async () => {
    if (!selectedPlot || !selectedUnit) return;

    if (!editTenantName.trim()) {
      Alert.alert('Validation Error', 'Please enter tenant name');
      return;
    }

    const cleanedPhone = editPhoneNumber.replace(/\s/g, '');
    if (!validatePhoneNumber(cleanedPhone)) {
      Alert.alert(
        'Invalid Phone Number',
        'Phone number must start with 01 or 07 and be exactly 10 digits (e.g., 0712345678)'
      );
      return;
    }

    // Check for duplicate phone number across all plots (exclude current unit)
    const formattedPhone = cleanedPhone.startsWith('0')
      ? '254' + cleanedPhone.substring(1)
      : cleanedPhone;
    for (const plot of plots) {
      for (const h of plot.houses) {
        if (
          h.tenantPhone === formattedPhone &&
          !(plot.id === selectedPlot.id && h.houseNo === selectedUnit.houseNo)
        ) {
          Alert.alert(
            'Duplicate Phone Number',
            `This phone number is already assigned to ${h.tenantName ?? 'a tenant'} in ${plot.plotName}, Unit ${h.houseNo}.`
          );
          return;
        }
      }
    }

    const month = parseInt(editMonthRented);
    if (isNaN(month) || month < 1 || month > 12) {
      Alert.alert('Validation Error', 'Month must be between 1 and 12');
      return;
    }

    const year = parseInt(editYearRented);
    if (isNaN(year) || year < 2000 || year > 2100) {
      Alert.alert('Validation Error', 'Please enter a valid year');
      return;
    }

    setSaving(true);
    try {
      const result = await updateTenantInUnit(
        selectedPlot.id!,
        selectedUnit.houseNo,
        {
          tenantName: editTenantName.trim(),
          phoneNumber: cleanedPhone,
          monthRented: month,
          yearRented: year,
        }
      );

      if (result.success) {
        Alert.alert('Success', 'Tenant updated successfully');
        setEditModalVisible(false);
        loadPlots();
      } else {
        Alert.alert('Error', result.error || 'Failed to update tenant');
      }
    } catch (error) {
      console.error('[Tenants] Error updating tenant:', error);
      Alert.alert('Error', 'Failed to update tenant');
    } finally {
      setSaving(false);
    }
  };

  const renderMonthSelector = (
    selectedValue: string,
    onSelect: (value: string) => void
  ) => (
    <View style={dynamicStyles.monthGrid}>
      {MONTH_OPTIONS.map(option => {
        const isSelected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[dynamicStyles.monthChip, isSelected && dynamicStyles.monthChipSelected]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                dynamicStyles.monthChipText,
                isSelected && dynamicStyles.monthChipTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Handle removing tenant from unit
  const handleRemoveTenant = (plot: PlotWithUnits, unit: HouseUnit) => {
    if (!unit.tenant) return;

    Alert.alert(
      'Remove Tenant',
      `Are you sure you want to remove ${unit.tenantName} from unit ${unit.houseNo}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeTenantFromUnit(plot.id!, unit.houseNo);
              if (result.success) {
                Alert.alert('Success', 'Tenant removed successfully');
                loadPlots();
              } else {
                Alert.alert('Error', result.error || 'Failed to remove tenant');
              }
            } catch (error) {
              console.error('[Tenants] Error removing tenant:', error);
              Alert.alert('Error', 'Failed to remove tenant');
            }
          },
        },
      ]
    );
  };

  // Calculate tenancy duration
  const getTenancyDuration = (monthRented: number, yearRented: number): string => {
    const startDate = new Date(yearRented, monthRented - 1);
    const now = new Date();
    
    const months = (now.getFullYear() - startDate.getFullYear()) * 12 + 
                   (now.getMonth() - startDate.getMonth());
    
    if (months < 1) return 'Less than a month';
    if (months === 1) return '1 month';
    if (months < 12) return `${months} months`;
    
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    
    if (remainingMonths === 0) return `${years} year${years > 1 ? 's' : ''}`;
    return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
  };

  // Render a single unit card
  const renderUnitCard = (unit: HouseUnit, plot: PlotWithUnits) => {
    const isOccupied = !!unit.tenant;
    const totalObligation = unit.baseRent + unit.garbageFees;

    return (
      <View key={unit.id} style={[dynamicStyles.unitCard, isOccupied ? dynamicStyles.occupiedUnit : dynamicStyles.vacantUnit]}>
        <View style={dynamicStyles.unitHeader}>
          <Text style={dynamicStyles.unitNumber}>Unit {unit.houseNo}</Text>
          <View style={[dynamicStyles.statusBadge, isOccupied ? dynamicStyles.occupiedBadge : dynamicStyles.vacantBadge]}>
            <Text style={dynamicStyles.statusText}>{isOccupied ? 'Occupied' : 'Vacant'}</Text>
          </View>
        </View>

        <View style={dynamicStyles.unitDetails}>
          <Text style={dynamicStyles.unitDetailText}>Base Rent: KES {unit.baseRent.toLocaleString()}</Text>
          <Text style={dynamicStyles.unitDetailText}>Garbage Fee: KES {unit.garbageFees.toLocaleString()}</Text>
          <Text style={dynamicStyles.unitDetailText}>Total: KES {totalObligation.toLocaleString()}/month</Text>
        </View>

        {isOccupied && unit.tenantName ? (
          <View style={dynamicStyles.tenantInfo}>
            <Text style={dynamicStyles.tenantName}>👤 {unit.tenantName}</Text>
            {unit.tenantPhone && (
              <Text style={dynamicStyles.tenantPhone}>📱 {unit.tenantPhone}</Text>
            )}
            {unit.depositPaid !== null && unit.depositPaid !== undefined && (
              <Text style={dynamicStyles.tenantDeposit}>💰 Deposit: KES {unit.depositPaid.toLocaleString()}</Text>
            )}
            {unit.monthRented && unit.yearRented && (
              <Text style={dynamicStyles.tenantDuration}>
                📅 {getTenancyDuration(unit.monthRented, unit.yearRented)}
              </Text>
            )}
            <TouchableOpacity
              style={dynamicStyles.editButton}
              onPress={() => handleEditTenant(plot, unit)}
            >
              <Text style={dynamicStyles.editButtonText}>Edit Tenant</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.removeButton}
              onPress={() => handleRemoveTenant(plot, unit)}
            >
              <Text style={dynamicStyles.removeButtonText}>Remove Tenant</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={dynamicStyles.assignButton}
            onPress={() => handleAssignTenant(plot, unit)}
          >
            <Text style={dynamicStyles.assignButtonText}>Assign Tenant</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render a plot card with all its units
  const renderPlotCard = ({ item: plot }: { item: PlotWithUnits }) => (
    <View style={dynamicStyles.plotCard}>
      <View style={dynamicStyles.plotHeader}>
        <Text style={dynamicStyles.plotName}>{plot.plotName}</Text>
        <View style={dynamicStyles.plotStats}>
          <Text style={dynamicStyles.plotStatText}>
            Total Units: {plot.numberOfUnits}
          </Text>
          <Text style={dynamicStyles.plotStatText}>
            Occupied: {plot.occupiedUnits} | Vacant: {plot.vacantUnits}
          </Text>
          <Text style={dynamicStyles.plotStatText}>
            Expected: KES {plot.totalRentAndGarbageExpected.toLocaleString()}/month
          </Text>
        </View>
      </View>

      <View style={dynamicStyles.unitsContainer}>
        {plot.houses.map(unit => renderUnitCard(unit, plot))}
      </View>
    </View>
  );

  // Dynamic styles with theme support
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.primary,
    },
    content: {
      flex: 1,
      padding: spacing.base,
    },
    searchInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.base,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: spacing.xl * 2,
    },
    emptyText: {
      fontSize: typography.fontSize.lg,
      color: themedColors.text.secondary,
      textAlign: 'center',
    },
    plotCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.base,
      marginBottom: spacing.base,
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    plotHeader: {
      marginBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.light,
      paddingBottom: spacing.md,
    },
    plotName: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
      marginBottom: spacing.xs,
    },
    plotStats: {
      gap: spacing.xs,
    },
    plotStatText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    unitsContainer: {
      gap: spacing.md,
    },
    unitCard: {
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      borderWidth: 1,
    },
    vacantUnit: {
      backgroundColor: themedColors.background.secondary,
      borderColor: themedColors.border.light,
    },
    occupiedUnit: {
      backgroundColor: themedColors.background.card,
      borderColor: themedColors.primary[500],
    },
    unitHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    unitNumber: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    vacantBadge: {
      backgroundColor: themedColors.warning + '20',
    },
    occupiedBadge: {
      backgroundColor: themedColors.success + '20',
    },
    statusText: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.primary,
    },
    unitDetails: {
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    unitDetailText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    tenantInfo: {
      backgroundColor: themedColors.background.secondary,
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      gap: spacing.xs,
    },
    tenantName: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    tenantPhone: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    tenantDeposit: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    tenantDuration: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
    },
    editButton: {
      backgroundColor: themedColors.primary[500],
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    editButtonText: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    assignButton: {
      backgroundColor: themedColors.primary[500],
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
    },
    assignButtonText: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    removeButton: {
      backgroundColor: themedColors.error,
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    removeButtonText: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    // Modal styles
    modalContainer: {
      flex: 1,
      backgroundColor: themedColors.background.primary,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    modalTitle: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold as any,
      color: themedColors.text.primary,
    },
    modalCloseButton: {
      padding: spacing.sm,
    },
    modalCloseText: {
      fontSize: typography.fontSize.xl,
      color: themedColors.text.secondary,
    },
    modalContent: {
      padding: spacing.base,
    },
    formLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    formInput: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      padding: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
    },
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    monthChip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      backgroundColor: themedColors.background.card,
      minWidth: 52,
      alignItems: 'center',
    },
    monthChipSelected: {
      backgroundColor: themedColors.primary[500],
      borderColor: themedColors.primary[500],
    },
    monthChipText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      fontWeight: typography.fontWeight.medium as any,
    },
    monthChipTextSelected: {
      color: '#FFFFFF',
    },
    formRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    formHalf: {
      flex: 1,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.base,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.main,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
      padding: spacing.md,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    cancelButtonText: {
      color: themedColors.text.primary,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
    },
    saveButton: {
      flex: 1,
      backgroundColor: themedColors.primary[500],
      padding: spacing.md,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
    },
    unitInfoText: {
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: themedColors.background.secondary,
      borderRadius: borderRadius.sm,
    },
  }), [themedColors]);

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <PageHeader
        title="Tenants Management"
        onMenuPress={() => setSidebarOpen(true)}
      />

      <View style={dynamicStyles.content}>
        <TextInput
          style={dynamicStyles.searchInput}
          placeholder="Search by plot, unit, or tenant name..."
          placeholderTextColor={themedColors.text.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? (
          <View style={dynamicStyles.loadingContainer}>
            <ActivityIndicator size="large" color={themedColors.primary[500]} />
            <Text style={dynamicStyles.emptyText}>Loading plots...</Text>
          </View>
        ) : filteredPlots.length === 0 ? (
          <View style={dynamicStyles.emptyContainer}>
            <Text style={dynamicStyles.emptyText}>
              {searchQuery ? 'No plots found matching your search' : 'No plots registered yet'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredPlots}
            renderItem={renderPlotCard}
            keyExtractor={item => item.id || ''}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Assign Tenant Modal */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer}>
          <View style={dynamicStyles.modalHeader}>
            <Text style={dynamicStyles.modalTitle}>Assign Tenant</Text>
            <TouchableOpacity
              style={dynamicStyles.modalCloseButton}
              onPress={() => setAssignModalVisible(false)}
            >
              <Text style={dynamicStyles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={dynamicStyles.modalContent}>
            {selectedPlot && selectedUnit && (
              <Text style={dynamicStyles.unitInfoText}>
                Plot: {selectedPlot.plotName} | Unit: {selectedUnit.houseNo}
                {'\n'}Rent: KES {selectedUnit.baseRent.toLocaleString()} | Garbage: KES {selectedUnit.garbageFees.toLocaleString()}
                {'\n'}Current Water Units: {selectedUnit.currentWaterUnits}
                {'\n'}Total: KES {(selectedUnit.baseRent + selectedUnit.garbageFees).toLocaleString()}/month
              </Text>
            )}

            <Text style={dynamicStyles.formLabel}>Tenant Name *</Text>
            <TextInput
              style={dynamicStyles.formInput}
              placeholder="Enter tenant name"
              placeholderTextColor={themedColors.text.placeholder}
              value={tenantName}
              onChangeText={setTenantName}
            />

            <Text style={dynamicStyles.formLabel}>Phone Number * (Format: 0712345678)</Text>
            <TextInput
              style={dynamicStyles.formInput}
              placeholder="0712345678 or 0123456789"
              placeholderTextColor={themedColors.text.placeholder}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={dynamicStyles.formLabel}>Deposit Paid *</Text>
            <TextInput
              style={dynamicStyles.formInput}
              placeholder="Enter deposit amount"
              placeholderTextColor={themedColors.text.placeholder}
              value={depositPaid}
              onChangeText={setDepositPaid}
              keyboardType="numeric"
            />

            <View style={dynamicStyles.formRow}>
              <View style={dynamicStyles.formHalf}>
                <Text style={dynamicStyles.formLabel}>Month Rented *</Text>
                {renderMonthSelector(monthRented, setMonthRented)}
              </View>

              <View style={dynamicStyles.formHalf}>
                <Text style={dynamicStyles.formLabel}>Year Rented * (e.g., 2026)</Text>
                <TextInput
                  style={dynamicStyles.formInput}
                  placeholder="e.g., 2026"
                  placeholderTextColor={themedColors.text.placeholder}
                  value={yearRented}
                  onChangeText={setYearRented}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
          </ScrollView>

          <View style={dynamicStyles.modalActions}>
            <TouchableOpacity
              style={dynamicStyles.cancelButton}
              onPress={() => setAssignModalVisible(false)}
              disabled={saving}
            >
              <Text style={dynamicStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={dynamicStyles.saveButton}
              onPress={handleSaveTenant}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={dynamicStyles.saveButtonText}>Assign Tenant</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Tenant Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeAreaView style={dynamicStyles.modalContainer}>
          <View style={dynamicStyles.modalHeader}>
            <Text style={dynamicStyles.modalTitle}>Edit Tenant</Text>
            <TouchableOpacity
              style={dynamicStyles.modalCloseButton}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={dynamicStyles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={dynamicStyles.modalContent}>
            {selectedPlot && selectedUnit && (
              <Text style={dynamicStyles.unitInfoText}>
                Plot: {selectedPlot.plotName} | Unit: {selectedUnit.houseNo}
              </Text>
            )}

            <Text style={dynamicStyles.formLabel}>Tenant Name *</Text>
            <TextInput
              style={dynamicStyles.formInput}
              placeholder="Enter tenant name"
              placeholderTextColor={themedColors.text.placeholder}
              value={editTenantName}
              onChangeText={setEditTenantName}
            />

            <Text style={dynamicStyles.formLabel}>Phone Number * (Format: 0712345678)</Text>
            <TextInput
              style={dynamicStyles.formInput}
              placeholder="0712345678 or 0123456789"
              placeholderTextColor={themedColors.text.placeholder}
              value={editPhoneNumber}
              onChangeText={setEditPhoneNumber}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <View style={dynamicStyles.formRow}>
              <View style={dynamicStyles.formHalf}>
                <Text style={dynamicStyles.formLabel}>Month Rented *</Text>
                {renderMonthSelector(editMonthRented, setEditMonthRented)}
              </View>

              <View style={dynamicStyles.formHalf}>
                <Text style={dynamicStyles.formLabel}>Year Rented * (e.g., 2026)</Text>
                <TextInput
                  style={dynamicStyles.formInput}
                  placeholder="e.g., 2026"
                  placeholderTextColor={themedColors.text.placeholder}
                  value={editYearRented}
                  onChangeText={setEditYearRented}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
          </ScrollView>

          <View style={dynamicStyles.modalActions}>
            <TouchableOpacity
              style={dynamicStyles.cancelButton}
              onPress={() => setEditModalVisible(false)}
              disabled={saving}
            >
              <Text style={dynamicStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={dynamicStyles.saveButton}
              onPress={handleSaveTenantEdit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={dynamicStyles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}
