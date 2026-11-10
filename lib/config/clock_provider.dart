import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:ada/utils/clock.dart';

final clockProvider = Provider<Clock>((ref) => const SystemClock());
