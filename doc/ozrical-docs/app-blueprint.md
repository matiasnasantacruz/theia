
El App Blueprint es la definición estructural y declarativa de una aplicación en Ozrical.
Representa el modelo base sobre el cual se construye, organiza y evoluciona una aplicación, independientemente de su diseño visual o de su implementación técnica.

Toda aplicación Ozrical comienza a partir de un App Blueprint.

Alcance y propósito

El App Blueprint tiene como objetivo describir:

Qué elementos componen la aplicación

Cómo se relacionan entre sí

Cómo se estructura la navegación

Cuál es el punto de entrada

Qué unidades funcionales existen

Qué interacciones están permitidas

Esta definición actúa como la fuente de verdad estructural de la aplicación.

Contenido del App Blueprint

El App Blueprint define, de forma explícita y declarativa:

La estructura base de la aplicación

El router raíz como punto de entrada obligatorio

El árbol de navegación completo

Las unidades funcionales que forman la aplicación

Las relaciones entre dichas unidades

Las conexiones lógicas que permiten intercambio de datos

Identificadores únicos (IDs) para cada elemento, permitiendo referencias claras y consistentes

A partir de esta definición, Ozrical puede inferir el comportamiento general de la aplicación sin requerir configuraciones adicionales.

Exclusiones explícitas

El App Blueprint no define:

Diseño visual

Layouts o estilos

Componentes gráficos

Lógica de negocio detallada

Flujos de ejecución complejos

Implementación técnica

Infraestructura o configuración de servidores

Estas responsabilidades pertenecen a otras capas del sistema y se construyen a partir del Blueprint, nunca dentro de él.

Relación con Ozrical Servers

El App Blueprint es suficiente para que una aplicación sea operativa.

A partir de su definición, Ozrical infiere automáticamente un backend intrínseco, que habilita:

navegación

persistencia básica

ejecución de flujos simples

De forma opcional, el Blueprint puede integrarse con Ozrical Servers o con servidores personalizados definidos por usuarios avanzados.
Esta integración no altera la estructura del Blueprint ni su rol como definición principal.

Naturaleza conceptual

El App Blueprint se caracteriza por ser:

Declarativo, no imperativo

Visual, pero no estético

Estructural, no funcional

Estable en el tiempo, incluso cuando cambian otras capas

Modelado como un grafo, no como una secuencia de pantallas

6.2.2.2.1.1.1 App Router

El App Router es el elemento estructural principal de una aplicación Ozrical y constituye el componente raíz disponible dentro del App Blueprint.

Toda aplicación definida en Ozrical debe contar con un App Router raíz, ya que este elemento establece el punto de entrada y define el marco general de navegación de la aplicación.

Propósito y función

El App Router tiene como función principal definir y orquestar las posibles rutas de navegación que un usuario puede recorrer dentro de la aplicación.

Puede entenderse como el mapa lógico de la aplicación, responsable de:

Determinar el punto inicial de acceso

Establecer las reglas de redirección

Controlar cómo se accede a cada sección o unidad funcional

Centralizar las decisiones de navegación en un único nodo estructural

Punto de entrada y control de acceso

El App Router define un punto de entrada inicial, el cual puede configurarse:

Con control de acceso (lock-in), requiriendo autenticación, autorización u otras condiciones previas

Sin control de acceso, permitiendo el ingreso directo a una sección específica de la aplicación

A partir de este punto de entrada, el Router evalúa las reglas definidas y redirige al usuario hacia el destino correspondiente.

Reglas de redirección

Las reglas de navegación definidas en el App Router permiten redirigir al usuario en función de distintos criterios, tales como:

Rol del usuario

Estado de sesión

Contexto de acceso

Condiciones declaradas en el Blueprint

Estas redirecciones pueden conducir, por ejemplo, a:

Un menú principal

Una vista inicial específica

Una sección operativa concreta

Una pantalla dedicada según el perfil del usuario

Rol dentro del App Blueprint

Dentro del App Blueprint, el App Router cumple un rol central:

Es el nodo raíz del árbol de navegación

De él se desprenden todas las rutas y secciones de la aplicación

Actúa como punto de referencia para la construcción de la experiencia de usuario

Permite visualizar de forma clara la estructura de acceso y navegación

El App Router no define cómo se representa visualmente la navegación, sino qué navegación es posible y bajo qué condiciones.

Naturaleza declarativa

El App Router es un componente declarativo.
Describe qué rutas existen y cómo se relacionan, sin imponer una implementación técnica específica ni un comportamiento visual determinado.

Esto permite que:

la navegación sea comprensible a alto nivel

la estructura pueda evolucionar sin romper la aplicación

el backend intrínseco y los sistemas externos interpreten la navegación de forma consistente

Controles de acceso

Es posible controlar el acceso mediante dos premisas:

Access Gate: Define si el usuario puede pasar o no.

Access Context: Si el usuario puede hacer uso del recurso, establece con que parámetros y bajo qué condiciones:

Permisos de lectura, escritura y eliminación.

Conectores de datos, útiles para parametrización

Access Gate (El Filtro de Entrada)

El Access Gate actúa como un guardia de seguridad en la puerta de un edificio. Su única función es validar la identidad y el rol para decidir si el usuario tiene permiso de entrar o no a una ruta o recurso específico.

Comportamiento: Booleano (Permitir / Denegar).

Momento de ejecución: Antes de cargar el componente o recurso (Pre-render).

Criterios de evaluación:

Autenticación: ¿El usuario está logueado? (Ej: El candado en Menu Home).

Autorización por Rol: ¿Pertenece al grupo permitido? (Ej: #2 Solo admin o #1 Todos).

Access Context (El Filtro de Operación)

Una vez que el usuario ha cruzado el "Gate", el Access Context define qué puede hacer y cómo ve los datos dentro de ese espacio. No prohíbe la entrada, sino que parametriza la experiencia.

Comportamiento: Atributivo y restrictivo (Lectura, Escritura, Borrado, Filtrado).

Momento de ejecución: Durante la sesión/uso del recurso.

Criterios de evaluación:

Permisos granulares: Solo lectura vs Escritura.

Conectores de datos: Filtra la información que el backend devuelve según el contexto del usuario (ej: un gerente ve todas las sucursales, un empleado solo la suya).
