/**
 * Register Plot Page
 * Form to register a new plot with house numbers and their details
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
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
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/design';
import { db } from '../../firebaseConfig';
import { useThemedColors } from '../../hooks/use-themed-colors';

interface HouseUnit {
  id: string;
  houseNo: string;
  baseRent: number;
  garbageFees: number;
  previousWaterUnits: number;
}

export default function RegisterPlot() {
  const themedColors = useThemedColors();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [plotName, setPlotName] = useState('');
  const [houses, setHouses] = useState<HouseUnit[]>([]);

  // Add a new house unit
  const addHouseUnit = () => {
    const newHouse: HouseUnit = {
      id: Date.now().toString(),
      houseNo: '',
      baseRent: 0,
      garbageFees: 0,
      previousWaterUnits: 0,
    };
    setHouses([...houses, newHouse]);
  };

  // Update house unit field
  const updateHouseUnit = (id: string, field: keyof HouseUnit, value: string | number) => {
    setHouses(houses.map(house => 
      house.id === id ? { ...house, [field]: value } : house
    ));
  };

  // Remove house unit
  const removeHouseUnit = (id: string) => {
    if (houses.length === 1) {
      Alert.alert('Error', 'You must have at least one house unit');
      return;
    }
    setHouses(houses.filter(house => house.id !== id));
  };

  // Calculate totals
  const numberOfUnits = houses.length;
  const totalRentAndGarbageExpected = houses.reduce(
    (sum, house) => sum + (house.baseRent || 0) + (house.garbageFees || 0),
    0
  );

  // Validate form
  const validateForm = (): boolean => {
    if (!plotName.trim()) {
      Alert.alert('Validation Error', 'Please enter a plot name');
      return false;
    }
    
    if (houses.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one house unit');
      return false;
    }

    for (const house of houses) {
      if (!house.houseNo.trim()) {
        Alert.alert('Validation Error', 'All house numbers must be filled');
        return false;
      }
      if (house.baseRent <= 0) {
        Alert.alert('Validation Error', `Base rent for ${house.houseNo} must be greater than 0`);
        return false;
      }
    }

    return true;
  };

  // Save plot to Firestore
  const savePlot = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const plotData = {
        plotName: plotName.trim(),
        houses: houses.map(house => ({
          houseNo: house.houseNo.trim(),
          baseRent: house.baseRent,
          garbageFees: house.garbageFees,
          previousWaterUnits: house.previousWaterUnits,
          currentWaterUnits: house.previousWaterUnits, // Initially same as previous
          tenant: null, // Will be linked later
        })),
        numberOfUnits,
        totalRentAndGarbageExpected,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'plots'), plotData);
      
      console.log('[RegisterPlot] Plot saved with ID:', docRef.id);
      
      Alert.alert(
        'Success',
        `Plot "${plotName}" with ${numberOfUnits} unit${numberOfUnits !== 1 ? 's' : ''} has been registered.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setPlotName('');
              setHouses([]);
            },
          },
        ]
      );
    } catch (error) {
      console.error('[RegisterPlot] Error saving plot:', error);
      Alert.alert('Error', 'Failed to save plot. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  };

  // Dynamic styles with theme support
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
    },
    input: {
      backgroundColor: themedColors.background.primary,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
    },
    inputSmall: {
      backgroundColor: themedColors.background.primary,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      fontSize: typography.fontSize.sm,
      color: themedColors.text.primary,
    },
    sectionTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    labelSmall: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.base,
      alignItems: 'center' as const,
      ...shadows.sm,
    },
    summaryLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.tertiary,
      marginBottom: spacing.xs,
    },
    emptyUnits: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.md,
      padding: spacing.xl,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderStyle: 'dashed' as const,
      borderColor: themedColors.border.main,
    },
    emptyUnitsText: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      textAlign: 'center' as const,
    },
    houseCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      marginBottom: spacing.md,
      ...shadows.sm,
    },
    houseHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.light,
    },
    unitTotal: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.light,
    },
    unitTotalLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium as any,
      color: themedColors.text.tertiary,
    },
    unitTotalValue: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
      color: themedColors.text.primary,
    },
    footer: {
      padding: spacing.base,
      backgroundColor: themedColors.background.primary,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.main,
    },
  }), [themedColors]);

  return (
    <SafeAreaView style={dynamicStyles.container}>
      <PageHeader
        title="Register Plot"
        onMenuPress={() => setSidebarOpen(true)}
      />

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Plot Name */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Plot Details</Text>
            <View style={styles.inputGroup}>
              <Text style={dynamicStyles.label}>Plot Name *</Text>
              <TextInput
                style={dynamicStyles.input}
                value={plotName}
                onChangeText={setPlotName}
                placeholder="e.g., Sunshine Apartments"
                placeholderTextColor={themedColors.text.placeholder}
              />
            </View>
          </View>

          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <View style={dynamicStyles.summaryCard}>
              <Text style={dynamicStyles.summaryLabel}>No. of Units</Text>
              <Text style={styles.summaryValue}>{numberOfUnits}</Text>
            </View>
            <View style={dynamicStyles.summaryCard}>
              <Text style={dynamicStyles.summaryLabel}>Total Expected</Text>
              <Text style={styles.summaryValueSmall}>
                {formatCurrency(totalRentAndGarbageExpected)}
              </Text>
            </View>
          </View>

          {/* House Units */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={dynamicStyles.sectionTitle}>House Units</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={addHouseUnit}
                activeOpacity={0.7}
              >
                <Text style={styles.addButtonText}>+ Add Unit</Text>
              </TouchableOpacity>
            </View>

            {houses.length === 0 ? (
              <View style={dynamicStyles.emptyUnits}>
                <Text style={dynamicStyles.emptyUnitsText}>
                  No house units added yet. Tap "Add Unit" to start.
                </Text>
              </View>
            ) : (
              houses.map((house, index) => (
                <View key={house.id} style={dynamicStyles.houseCard}>
                  <View style={dynamicStyles.houseHeader}>
                    <Text style={styles.houseNumber}>Unit {index + 1}</Text>
                    <TouchableOpacity
                      onPress={() => removeHouseUnit(house.id)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.houseInputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>House No. *</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.houseNo}
                        onChangeText={(value) => updateHouseUnit(house.id, 'houseNo', value)}
                        placeholder="A1"
                        placeholderTextColor={themedColors.text.placeholder}
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1.5 }]}>
                      <Text style={dynamicStyles.labelSmall}>Base Rent (KES) *</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.baseRent ? house.baseRent.toString() : ''}
                        onChangeText={(value) => updateHouseUnit(house.id, 'baseRent', parseInt(value) || 0)}
                        placeholder="10000"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.houseInputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>Garbage Fees (KES)</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.garbageFees ? house.garbageFees.toString() : ''}
                        onChangeText={(value) => updateHouseUnit(house.id, 'garbageFees', parseInt(value) || 0)}
                        placeholder="500"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>Prev. Water Units</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.previousWaterUnits ? house.previousWaterUnits.toString() : ''}
                        onChangeText={(value) => updateHouseUnit(house.id, 'previousWaterUnits', parseInt(value) || 0)}
                        placeholder="0"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Unit Total */}
                  <View style={dynamicStyles.unitTotal}>
                    <Text style={dynamicStyles.unitTotalLabel}>Unit Total:</Text>
                    <Text style={dynamicStyles.unitTotalValue}>
                      {formatCurrency((house.baseRent || 0) + (house.garbageFees || 0))}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Save Button */}
        {houses.length > 0 && (
          <View style={dynamicStyles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={savePlot}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Plot</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  menuButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  menuIcon: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  menuLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.neutral[700],
    borderRadius: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
  },
  labelSmall: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[600],
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.neutral[900],
  },
  inputSmall: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.neutral[900],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    alignItems: 'center',
    ...shadows.sm,
  },
  summaryLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[500],
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  summaryValueSmall: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.success.dark,
  },
  addButton: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  emptyUnits: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.neutral[300],
  },
  emptyUnitsText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    textAlign: 'center',
  },
  houseCard: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  houseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  houseNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.error.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    color: colors.error.dark,
    fontWeight: typography.fontWeight.bold,
  },
  houseInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  unitTotalLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[500],
  },
  unitTotalValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
  },
  bottomSpacer: {
    height: spacing['3xl'],
  },
  footer: {
    padding: spacing.base,
    backgroundColor: colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  saveButton: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonDisabled: {
    backgroundColor: colors.primary[300],
  },
  saveButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
});
