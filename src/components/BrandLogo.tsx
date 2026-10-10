import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';

/** App header mark: the coach's own logo when they uploaded one, otherwise the ADLR wordmark. */
export default function BrandLogo({ size = 18 }: { size?: number }) {
  const { coach } = useAuth();
  if (coach?.brand_logo) {
    return <img src={coach.brand_logo} alt="" className="object-contain object-left" style={{ height: size * 1.7, maxWidth: size * 8 }} />;
  }
  return <Logo size={size} />;
}
