// Icon adapter: the app imports icons from 'lucide-react' everywhere, but we
// render Phosphor's DUOTONE weight for a heavier, filled, "app-like" look
// (2010–2015 era). `lucide-react` is aliased to this file in vite.config.ts and
// tsconfig paths, so every existing <Car/>, <Settings/>… becomes duotone with
// zero call-site changes. Names below mirror the lucide names actually used.
import { forwardRef } from 'react'
import type { Icon, IconProps } from '@phosphor-icons/react'
import {
  Car as I_Car,
  Coins as I_Coins,
  FileText as I_FileText,
  Camera as I_Camera,
  ImageSquare as I_ImageSquare,
  Image as I_Image,
  CircleNotch as I_CircleNotch,
  Check as I_Check,
  CheckCircle as I_CheckCircle,
  CaretUpDown as I_CaretUpDown,
  CaretDown as I_CaretDown,
  CaretLeft as I_CaretLeft,
  CaretRight as I_CaretRight,
  Plus as I_Plus,
  MagnifyingGlass as I_MagnifyingGlass,
  Tag as I_Tag,
  X as I_X,
  CalendarCheck as I_CalendarCheck,
  CalendarDots as I_CalendarDots,
  CalendarBlank as I_CalendarBlank,
  CalendarPlus as I_CalendarPlus,
  Envelope as I_Envelope,
  Lock as I_Lock,
  ArrowLeft as I_ArrowLeft,
  ArrowRight as I_ArrowRight,
  Star as I_Star,
  Prohibit as I_Prohibit,
  Trash as I_Trash,
  User as I_User,
  Users as I_Users,
  GridFour as I_GridFour,
  PencilSimple as I_PencilSimple,
  Sparkle as I_Sparkle,
  ShieldWarning as I_ShieldWarning,
  ShieldCheck as I_ShieldCheck,
  Flag as I_Flag,
  ClockCounterClockwise as I_ClockCCW,
  Clock as I_Clock,
  SealCheck as I_SealCheck,
  Key as I_Key,
  Warning as I_Warning,
  Wallet as I_Wallet,
  TrendUp as I_TrendUp,
  DownloadSimple as I_Download,
  Gauge as I_Gauge,
  Eye as I_Eye,
  EyeSlash as I_EyeSlash,
  Translate as I_Translate,
  SquaresFour as I_SquaresFour,
  ChartBar as I_ChartBar,
  GearSix as I_GearSix,
  SignOut as I_SignOut,
  List as I_List,
  WhatsappLogo as I_Whatsapp,
  Wrench as I_Wrench,
  Drop as I_Drop,
  Receipt as I_Receipt,
  UserPlus as I_UserPlus,
  ClipboardText as I_ClipboardText,
  ShieldSlash as I_ShieldSlash,
  DotsSixVertical as I_DotsSixVertical,
  ArrowCounterClockwise as I_ArrowCCW,
  UploadSimple as I_UploadSimple,
  Copy as I_Copy,
  DotsThreeVertical as I_DotsThreeVertical,
  Buildings as I_Buildings,
  Power as I_Power,
  CreditCard as I_CreditCard,
  Table as I_Table,
  Pulse as I_Activity,
  XCircle as I_XCircle,
  MapPin as I_MapPin,
} from '@phosphor-icons/react'

export type LucideIcon = Icon

// Wrap a Phosphor icon so it defaults to duotone weight but still accepts
// className, size, and an explicit weight override.
function duo(C: Icon): Icon {
  const W = forwardRef<SVGSVGElement, IconProps>(function Wrapped({ weight = 'duotone', ...rest }, ref) {
    return <C ref={ref} weight={weight} {...rest} />
  })
  W.displayName = 'Icon'
  return W as unknown as Icon
}

// ── lucide name → phosphor duotone ──────────────────────
export const Car = duo(I_Car)
export const Coins = duo(I_Coins)
export const FileText = duo(I_FileText)
export const Camera = duo(I_Camera)
export const ImagePlus = duo(I_ImageSquare)
export const ImageOff = duo(I_Image)
export const Loader2 = duo(I_CircleNotch)
export const Check = duo(I_Check)
export const CheckCircle2 = duo(I_CheckCircle)
export const ChevronsUpDown = duo(I_CaretUpDown)
export const ChevronDown = duo(I_CaretDown)
export const ChevronLeft = duo(I_CaretLeft)
export const ChevronRight = duo(I_CaretRight)
export const Plus = duo(I_Plus)
export const Search = duo(I_MagnifyingGlass)
export const Tag = duo(I_Tag)
export const X = duo(I_X)
export const CalendarCheck = duo(I_CalendarCheck)
export const CalendarClock = duo(I_CalendarDots)
export const CalendarDays = duo(I_CalendarDots)
export const CalendarSearch = duo(I_CalendarDots)
export const CalendarRange = duo(I_CalendarBlank)
export const CalendarPlus = duo(I_CalendarPlus)
export const Mail = duo(I_Envelope)
export const Lock = duo(I_Lock)
export const ArrowLeft = duo(I_ArrowLeft)
export const ArrowRight = duo(I_ArrowRight)
export const Star = duo(I_Star)
export const Ban = duo(I_Prohibit)
export const Trash2 = duo(I_Trash)
export const User = duo(I_User)
export const Users = duo(I_Users)
export const Grid3x3 = duo(I_GridFour)
export const Pencil = duo(I_PencilSimple)
export const Sparkles = duo(I_Sparkle)
export const ShieldAlert = duo(I_ShieldWarning)
export const ShieldCheck = duo(I_ShieldCheck)
export const Flag = duo(I_Flag)
export const History = duo(I_ClockCCW)
export const Clock = duo(I_Clock)
export const FileCheck = duo(I_SealCheck)
export const KeyRound = duo(I_Key)
export const AlertTriangle = duo(I_Warning)
export const Wallet = duo(I_Wallet)
export const TrendingUp = duo(I_TrendUp)
export const Download = duo(I_Download)
export const Gauge = duo(I_Gauge)
export const Eye = duo(I_Eye)
export const EyeOff = duo(I_EyeSlash)
export const Languages = duo(I_Translate)
export const LayoutDashboard = duo(I_SquaresFour)
export const BarChart3 = duo(I_ChartBar)
export const Settings = duo(I_GearSix)
export const LogOut = duo(I_SignOut)
export const Menu = duo(I_List)
export const MessageCircle = duo(I_Whatsapp)
export const Wrench = duo(I_Wrench)
export const Droplet = duo(I_Drop)
export const Droplets = duo(I_Drop)
export const Receipt = duo(I_Receipt)
export const UserPlus = duo(I_UserPlus)
export const ClipboardCheck = duo(I_ClipboardText)
export const ShieldOff = duo(I_ShieldSlash)
export const GripVertical = duo(I_DotsSixVertical)
export const RotateCcw = duo(I_ArrowCCW)
export const Upload = duo(I_UploadSimple)
export const Copy = duo(I_Copy)
export const MoreVertical = duo(I_DotsThreeVertical)
export const Building2 = duo(I_Buildings)
export const Power = duo(I_Power)
export const CreditCard = duo(I_CreditCard)
export const Table = duo(I_Table)
export const Activity = duo(I_Activity)
export const XCircle = duo(I_XCircle)
export const MapPin = duo(I_MapPin)
