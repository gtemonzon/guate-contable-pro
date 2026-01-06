const Propuesta = () => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: 'white', color: '#2c3e50', lineHeight: 1.6, margin: 0, padding: 0 }}>
      <style>{`
        @page {
          size: letter;
          margin: 0;
        }
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .page {
            margin: 0;
            padding: 0.5in;
          }
          .feature-item:hover {
            transform: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      
      <div className="page" style={{ width: '8.5in', minHeight: '11in', padding: '0.75in', background: 'white', margin: '0 auto', position: 'relative' }}>
        {/* WhatsApp Button */}
        <a
          href="https://wa.me/50254135354?text=Hola,%20me%20interesa%20conocer%20más%20sobre%20Conta-Online"
          target="_blank"
          rel="noopener noreferrer"
          className="no-print"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            background: '#25D366',
            color: 'white',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.4)',
            textDecoration: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 211, 102, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.4)';
          }}
        >
          <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>

        {/* Print Button */}
        <div className="no-print" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <button
            onClick={handlePrint}
            style={{
              background: '#3498db',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px', paddingBottom: '20px', borderBottom: '3px solid #3498db' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '15px' }}>
            <img 
              src="/favicon.png" 
              alt="Conta-Online Logo" 
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '15px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            />
            <div>
              <h1 style={{ fontSize: '36px', color: '#2c3e50', fontWeight: 700, margin: 0 }}>Conta-Online</h1>
              <p style={{ fontSize: '16px', color: '#7f8c8d', fontStyle: 'italic', marginTop: '5px' }}>Sistema Contable en la Nube</p>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div style={{
          background: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '35px',
          boxShadow: '0 6px 12px rgba(52, 152, 219, 0.3)'
        }}>
          <h2 style={{ fontSize: '24px', marginBottom: '15px', textAlign: 'center' }}>Moderniza tu Gestión Contable</h2>
          <p style={{ textAlign: 'center', fontSize: '15px', lineHeight: 1.8 }}>
            Sistema contable 100% web diseñado específicamente para oficinas contables en Guatemala. 
            Accede desde cualquier dispositivo, en cualquier momento, con la seguridad y flexibilidad 
            que tu negocio necesita.
          </p>
        </div>

        {/* Características Principales */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{
            fontSize: '20px',
            color: '#2c3e50',
            marginBottom: '15px',
            paddingBottom: '8px',
            borderBottom: '2px solid #ecf0f1',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ width: '6px', height: '24px', background: '#3498db', borderRadius: '3px', display: 'inline-block' }}></span>
            Características Principales
          </h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {[
              {
                num: '1',
                title: 'Multi-Usuario y Multi-Empresa',
                desc: 'Gestiona múltiples empresas desde una sola plataforma. Sistema de roles de usuario para control de accesos y permisos diferenciados (Administrador, Contador Senior, Auxiliar Contable, Cliente).'
              },
              {
                num: '2',
                title: '100% Web - Multi-Plataforma',
                desc: 'Accede desde PC, laptop, tablet o cualquier dispositivo con navegador web. URL personalizada con el nombre y logo de tu oficina contable para darle identidad corporativa a tu servicio.'
              },
              {
                num: '3',
                title: 'Importación Inteligente de Datos',
                desc: 'Importa archivos Excel (XLS) y CSV directamente desde el portal de SAT para libros de compras y ventas. Ahorra tiempo eliminando la digitación manual de facturas.'
              },
              {
                num: '4',
                title: 'Control de Fechas Fiscales',
                desc: 'Sistema de alertas y recordatorios para fechas clave de pago de impuestos (IVA, ISR trimestral, ISR anual). Nunca más olvides un vencimiento importante.'
              },
              {
                num: '5',
                title: 'Gestión Documental Integrada',
                desc: 'Almacena y organiza documentos importantes: DPI de representantes legales, escrituras de constitución, patentes, RTU, formularios SAT pagados y más. Todo en un solo lugar, seguro y accesible.'
              }
            ].map((feature) => (
              <div key={feature.num} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                background: '#f8f9fa',
                borderRadius: '8px',
                borderLeft: '4px solid #3498db'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  background: '#3498db',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  flexShrink: 0,
                  fontSize: '12px'
                }}>{feature.num}</div>
                <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.6 }}>
                  <strong style={{ color: '#2c3e50', display: 'block', marginBottom: '3px' }}>{feature.title}</strong>
                  {feature.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sección de Precio */}
        <div style={{
          background: 'linear-gradient(135deg, #27ae60 0%, #229954 100%)',
          color: 'white',
          padding: '25px',
          borderRadius: '12px',
          textAlign: 'center',
          margin: '30px 0',
          boxShadow: '0 6px 12px rgba(39, 174, 96, 0.3)'
        }}>
          <h3 style={{ fontSize: '22px', marginBottom: '15px', border: 'none', color: 'white' }}>Inversión Mensual</h3>
          <div style={{ fontSize: '48px', fontWeight: 'bold', margin: '10px 0' }}>Q 750.00</div>
          <div style={{ fontSize: '18px', opacity: 0.9 }}>por mes</div>
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '2px solid rgba(255,255,255,0.3)', fontSize: '14px', lineHeight: 1.8 }}>
            ✓ Sin pago inicial de implementación<br />
            ✓ Sin costos de instalación<br />
            ✓ Facturado mensualmente
          </div>
        </div>

        {/* Beneficios Incluidos */}
        <div style={{
          background: '#fff9e6',
          border: '2px solid #f39c12',
          borderRadius: '10px',
          padding: '20px',
          margin: '25px 0'
        }}>
          <h4 style={{ color: '#d68910', fontSize: '18px', marginBottom: '12px', textAlign: 'center' }}>🎁 Incluido en tu Suscripción Mensual</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {[
              { title: 'Acompañamiento en Migración:', desc: 'Te ayudamos a importar datos de tu sistema anterior sin costo adicional' },
              { title: 'Capacitación Inicial:', desc: '5 horas de capacitación personalizada para tu equipo en el uso del sistema' },
              { title: 'Soporte Técnico Continuo:', desc: 'Corrección de errores y bugs sin costo adicional' },
              { title: 'Adaptaciones Menores:', desc: 'Ajustes y mejoras según los procesos de tu oficina incluidos en el plan mensual' },
              { title: 'Actualizaciones Automáticas:', desc: 'Nuevas funcionalidades y mejoras sin cargo extra' }
            ].map((benefit, idx) => (
              <li key={idx} style={{ padding: '8px 0', paddingLeft: '30px', position: 'relative', fontSize: '13px' }}>
                <span style={{ position: 'absolute', left: 0, color: '#27ae60', fontWeight: 'bold', fontSize: '18px' }}>✓</span>
                <strong>{benefit.title}</strong> {benefit.desc}
              </li>
            ))}
          </ul>
        </div>

        {/* Nota sobre cambios mayores */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{
            fontSize: '20px',
            color: '#2c3e50',
            marginBottom: '15px',
            paddingBottom: '8px',
            borderBottom: '2px solid #ecf0f1',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ width: '6px', height: '24px', background: '#3498db', borderRadius: '3px', display: 'inline-block' }}></span>
            Desarrollo a Medida
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px',
            background: '#f8f9fa',
            borderRadius: '8px',
            borderLeft: '4px solid #3498db'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              background: '#3498db',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              flexShrink: 0,
              fontSize: '12px'
            }}>💡</div>
            <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.6 }}>
              Para cambios que requieran creación de nuevas tablas, módulos completos o ventanas adicionales, 
              se realizará una cotización por separado según la complejidad del desarrollo solicitado.
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div style={{ textAlign: 'center', marginTop: '35px' }}>
          <div style={{
            background: '#2c3e50',
            color: 'white',
            padding: '15px 30px',
            borderRadius: '8px',
            display: 'inline-block',
            margin: '20px 0',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            ¡Comienza a modernizar tu oficina contable hoy mismo!
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '40px',
          paddingTop: '20px',
          borderTop: '2px solid #ecf0f1',
          textAlign: 'center',
          fontSize: '12px',
          color: '#7f8c8d'
        }}>
          <p><strong>Conta-Online</strong> - Sistema Contable en la Nube para Guatemala</p>
          <p style={{ marginTop: '10px' }}>
            Para más información y solicitar una demostración, contáctanos.<br />
            Documento generado el 6 de enero de 2026
          </p>
        </div>
      </div>
    </div>
  );
};

export default Propuesta;
